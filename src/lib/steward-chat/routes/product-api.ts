import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { readJsonLimited } from "../../http/read-json-limited.js";
import { listLedgerPlans, resolveLedgerPlan } from "../../product/ledger-plans.js";
import {
  createLedgerSignup,
  updateLedgerSignup,
} from "../../product/ledger-fleet.js";
import { createLedgerCheckoutSession, parseStripeWebhookEvent, verifyStripeWebhookSignature } from "../../product/stripe-checkout.js";
import {
  buildStripeSettingsSnapshot,
  saveStripeSecrets,
} from "../../product/stripe-secrets-store.js";
import {
  attestStripeBilling,
  buildStripeBillingStatus,
  isStripeBillingCommercialReady,
  isStripeWebhookStubAllowed,
  stripeWebhookSecretConfigured,
} from "../../product/stripe-ops.js";
import {
  isStripeWebhookEventProcessed,
  markStripeWebhookEventProcessed,
} from "../../product/ledger-stripe-webhook-idempotency.js";
import { handleStripeWebhookEvent } from "../../product/stripe-webhook.js";
import { sendLedgerMail } from "../../product/ledger-mail.js";
import { loadLedgerSubscription } from "../../product/ledger-subscription.js";
import {
  buildCustomerAdminSnapshot,
  inviteLedgerOperator,
} from "../../product/ledger-customer-admin.js";
import { findOperatorById } from "../../org/operators.js";
import { buildOnboardingReport } from "../../product/ledger-onboarding.js";
import { getLegalDocumentationStatus } from "../../product/ledger-legal-attestation.js";
import {
  buildAccountantFleetSnapshot,
} from "../../product/ledger-accountant-channel.js";
import { applyOnboardingSetup } from "../../product/ledger-onboarding-setup.js";
import { createGuestInviteToken, buildGuestSetupSnapshot } from "../../product/ledger-guest-invite.js";
import { buildTaxReadinessReport } from "../../product/ledger-tax-readiness.js";
import {
  loadControlPlane,
  resolveTenantFromRequest,
  syncControlPlaneFromProductTenants,
} from "../../product/ledger-control-plane.js";
import { buildProductInitialSetupReport } from "../../product/ledger-product-initial-setup.js";
import { hydrateStripeEnvFromStore } from "../../product/stripe-secrets-store.js";
import { resolveTenantFromEnv } from "../../orgos-cli.js";
import { buildOpsDashboardSnapshot } from "../../product/ledger-ops-dashboard.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function publicOrigin(req: IncomingMessage): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const host = req.headers.host ?? "localhost:9470";
  return `${proto}://${host}`;
}

function requireCeo(user: WireConsoleUser, res: ServerResponse): boolean {
  const op = findOperatorById(user.operator_id);
  if (op?.role === "ceo" || op?.role === "approver") return true;
  if (!requireChatPermission(user, "chat:approve", res)) return false;
  return true;
}

/**
 * GET  /chat/v1/product/plans
 * POST /chat/v1/product/signup
 * POST /chat/v1/product/stripe/webhook
 * GET  /chat/v1/product/subscription
 * GET  /chat/v1/product/admin
 * GET  /chat/v1/product/stripe-settings
 * GET  /chat/v1/product/control-plane
 * GET  /chat/v1/product/ops-dashboard
 * POST /chat/v1/product/admin/operators
 */
export async function handleProductApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user?: WireConsoleUser,
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/product/")) return false;

  if (pathname === "/chat/v1/product/plans" && method === "GET") {
    json(res, 200, { plans: listLedgerPlans() });
    return true;
  }

  if (pathname === "/chat/v1/product/guest-setup" && method === "GET") {
    const url = new URL(req.url ?? "/", "http://localhost");
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (!token) {
      json(res, 422, { ok: false, error: "token required" });
      return true;
    }
    const snapshot = buildGuestSetupSnapshot(token);
    if (!snapshot.ok) {
      json(res, 403, { ok: false, error: snapshot.error });
      return true;
    }
    const operator = findOperatorById(snapshot.operator_id);
    json(res, 200, {
      ok: true,
      tenant_id: snapshot.tenant_id,
      email: snapshot.email,
      operator_id: snapshot.operator_id,
      approver_id:
        operator?.approver_name?.trim() ||
        operator?.display_name?.trim() ||
        snapshot.operator_id,
      expires_at: snapshot.expires_at,
    });
    return true;
  }

  if (pathname === "/chat/v1/product/signup" && method === "POST") {
    try {
      const body = (await readJsonLimited(req)) as {
        company_name?: string;
        admin_email?: string;
        plan?: string;
        tenant_id?: string;
      };
      const companyName = body.company_name?.trim();
      const adminEmail = body.admin_email?.trim();
      const planId = body.plan?.trim() ?? "starter";
      if (!companyName || !adminEmail) {
        json(res, 422, { ok: false, error: "company_name and admin_email required" });
        return true;
      }
      const plan = resolveLedgerPlan(planId);
      const slug = companyName
        .toLowerCase()
        .replace(/株式会社|合同会社/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24);
      const tenantId =
        body.tenant_id?.trim().toLowerCase() ?? (slug || `ledger-${Date.now()}`);
      const signup = createLedgerSignup({
        tenantId,
        companyName,
        adminEmail,
        plan: plan.id,
      });
      const origin = publicOrigin(req);
      const checkout = await createLedgerCheckoutSession({
        signupId: signup.signup_id,
        email: adminEmail,
        plan,
        successUrl: `${origin}/signup?success=1&signup_id=${signup.signup_id}`,
        cancelUrl: `${origin}/signup?cancelled=1`,
      });
      updateLedgerSignup(signup.signup_id, {
        status: "checkout",
        stripe_checkout_session_id: checkout.session_id,
      });
      void sendLedgerMail({
        kind: "signup_received",
        to: adminEmail,
        tenantId,
        companyName,
      });
      json(res, 200, {
        ok: true,
        signup_id: signup.signup_id,
        tenant_id: signup.tenant_id,
        checkout_url: checkout.url,
        checkout_mode: checkout.mode,
      });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/product/stripe/webhook" && method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const payload = Buffer.concat(chunks).toString("utf-8");
    const signature = req.headers["stripe-signature"] as string | undefined;
    if (!isStripeWebhookStubAllowed() && !stripeWebhookSecretConfigured()) {
      json(res, 503, { ok: false, error: "stripe webhook not configured" });
      return true;
    }
    const stubMode = !stripeWebhookSecretConfigured();
    if (!stubMode && !verifyStripeWebhookSignature({ payload, signatureHeader: signature })) {
      json(res, 400, { ok: false, error: "invalid signature" });
      return true;
    }
    try {
      const event = parseStripeWebhookEvent(payload);
      if (event.id && isStripeWebhookEventProcessed(event.id)) {
        json(res, 200, { ok: true, duplicate: true, event_id: event.id });
        return true;
      }
      const result = handleStripeWebhookEvent(event);
      if (event.id && result.handled) {
        markStripeWebhookEventProcessed(event.id);
      }
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (!user) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return true;
  }

  if (pathname === "/chat/v1/product/subscription" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { subscription: loadLedgerSubscription(), plans: listLedgerPlans() });
    return true;
  }

  if (pathname === "/chat/v1/product/admin" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const origin = publicOrigin(req);
    const op = findOperatorById(user.operator_id);
    json(res, 200, {
      ...(await buildCustomerAdminSnapshot(`${origin}/?account=1`)),
      platform_billing_settings:
        op?.role === "ceo" || op?.role === "approver",
    });
    return true;
  }

  if (pathname === "/chat/v1/product/stripe-settings" && method === "GET") {
    if (!requireCeo(user, res)) return true;
    hydrateStripeEnvFromStore();
    const billing = buildStripeBillingStatus();
    json(res, 200, {
      ok: true,
      ...buildStripeSettingsSnapshot(),
      commercial_ready: billing.commercial_ready,
      live_ready: billing.live_ready,
      attestation: billing.attestation,
      next_steps: billing.next_steps,
      webhook_url: `${publicOrigin(req)}${billing.webhook_path}`,
    });
    return true;
  }

  if (pathname === "/chat/v1/product/stripe-settings" && method === "PUT") {
    if (!requireCeo(user, res)) return true;
    try {
      const body = (await readJsonLimited(req)) as {
        stripe_secret_key?: string;
        stripe_webhook_secret?: string;
        stripe_price_starter?: string;
        stripe_price_business?: string;
        stripe_price_accountant?: string;
      };
      saveStripeSecrets({
        STRIPE_SECRET_KEY: body.stripe_secret_key,
        STRIPE_WEBHOOK_SECRET: body.stripe_webhook_secret,
        STRIPE_PRICE_STARTER: body.stripe_price_starter,
        STRIPE_PRICE_BUSINESS: body.stripe_price_business,
        STRIPE_PRICE_ACCOUNTANT: body.stripe_price_accountant,
      });
      if (isStripeBillingCommercialReady()) {
        attestStripeBilling({ note: "Saved via Operator Console stripe settings" });
      }
      const billing = buildStripeBillingStatus();
      json(res, 200, {
        ok: true,
        ...buildStripeSettingsSnapshot(),
        commercial_ready: billing.commercial_ready,
        live_ready: billing.live_ready,
        attestation: billing.attestation,
        next_steps: billing.next_steps,
        webhook_url: `${publicOrigin(req)}${billing.webhook_path}`,
      });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/product/admin/billing-portal" && method === "POST") {
    if (!requireCeo(user, res)) return true;
    const snapshot = await buildCustomerAdminSnapshot(`${publicOrigin(req)}/?account=1`);
    if (!snapshot.billing_portal_url) {
      json(res, 422, { ok: false, error: "billing portal unavailable" });
      return true;
    }
    json(res, 200, {
      ok: true,
      url: snapshot.billing_portal_url,
      mode: snapshot.billing_portal_mode,
    });
    return true;
  }

  if (pathname === "/chat/v1/product/admin/operators" && method === "POST") {
    if (!requireCeo(user, res)) return true;
    try {
      const body = (await readJsonLimited(req)) as {
        display_name?: string;
        email?: string;
        role?: "operator" | "readonly" | "approver";
        guest_expires_at?: string;
        send_invite_mail?: boolean;
      };
      if (!body.display_name?.trim() || !body.email?.trim()) {
        json(res, 422, { ok: false, error: "display_name and email required" });
        return true;
      }
      const result = inviteLedgerOperator({
        displayName: body.display_name,
        email: body.email,
        role: body.role ?? "operator",
        guestExpiresAt: body.guest_expires_at,
      });
      let setupUrl: string | undefined;
      let mailId: string | undefined;
      const tenantId = resolveTenantFromRequest(req) ?? resolveTenantFromEnv();
      if (!tenantId) {
        json(res, 422, { ok: false, error: "tenant not resolved" });
        return true;
      }
      if (body.role === "readonly" && body.guest_expires_at) {
        const invite = createGuestInviteToken({
          tenantId,
          email: body.email,
          operatorId: result.operator_id,
          expiresAt: body.guest_expires_at,
        });
        setupUrl = `${publicOrigin(req)}${invite.setup_path}`;
      }
      const shouldMail =
        body.send_invite_mail !== false && Boolean(setupUrl || body.email);
      if (shouldMail && (setupUrl || body.role === "readonly")) {
        const mail = await sendLedgerMail({
          kind: "guest_invite",
          to: body.email,
          tenantId,
          setupUrl,
        });
        mailId = mail.id;
      }
      json(res, 200, {
        ok: true,
        ...result,
        setup_url: setupUrl,
        guest_expires_at: body.guest_expires_at,
        mail_id: mailId,
      });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/product/onboarding" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, buildOnboardingReport());
    return true;
  }

  if (pathname === "/chat/v1/product/legal-status" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, ...getLegalDocumentationStatus() });
    return true;
  }

  if (pathname === "/chat/v1/product/onboarding/setup" && method === "POST") {
    if (!requireCeo(user, res)) return true;
    try {
      const body = (await readJsonLimited(req)) as {
        company_name?: string;
        fiscal_year_end_month?: number;
        representative?: string;
      };
      json(res, 200, {
        ...applyOnboardingSetup({
          companyName: body.company_name,
          fiscalYearEndMonth: body.fiscal_year_end_month,
          representative: body.representative,
        }),
      });
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/product/tax-readiness" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, buildTaxReadinessReport());
    return true;
  }

  if (pathname === "/chat/v1/product/accountant-fleet" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      const tenantId = resolveTenantFromRequest(req) ?? resolveTenantFromEnv();
      if (!tenantId) {
        json(res, 422, { ok: false, error: "tenant not resolved" });
        return true;
      }
      json(res, 200, buildAccountantFleetSnapshot(tenantId));
    } catch (error) {
      json(res, 422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/product/initial-setup" && method === "GET") {
    if (!requireCeo(user, res)) return true;
    json(res, 200, { ok: true, ...buildProductInitialSetupReport() });
    return true;
  }

  if (pathname === "/chat/v1/product/control-plane" && method === "GET") {
    if (!requireCeo(user, res)) return true;
    syncControlPlaneFromProductTenants();
    json(res, 200, loadControlPlane());
    return true;
  }

  if (pathname === "/chat/v1/product/ops-dashboard" && method === "GET") {
    if (!requireCeo(user, res)) return true;
    json(res, 200, { ok: true, ...buildOpsDashboardSnapshot() });
    return true;
  }

  json(res, 404, { ok: false, error: "not found" });
  return true;
}
