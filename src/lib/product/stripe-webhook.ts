import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { getTenantsDir, getWorkspaceRoot } from "../orgos-paths.js";
import { listLedgerProductTenantIds } from "./ledger-product-tenant.js";
import { runWithTenantId } from "../tenant.js";
import {
  loadLedgerSubscription,
  saveLedgerSubscription,
  upsertLedgerSubscription,
} from "./ledger-subscription.js";
import { findLedgerSignup, setLedgerSignupStatus, updateLedgerSignup, withLedgerTenantAllocationLock } from "./ledger-fleet.js";
import { provisionLedgerTenant } from "./ledger-provision.js";
import { listLedgerMailOutbox, sendLedgerMail } from "./ledger-mail.js";
import { mintPasskeyBootstrapToken } from "../wire-console/auth/passkey-bootstrap.js";
import { findControlPlaneTenant } from "./ledger-control-plane.js";
import { isLedgerProductTenant } from "./ledger-product-tenant.js";
import { loadOperatorRegistry } from "../org/operators.js";
import { getClock } from "../runtime-context.js";
import { isProductionEnv } from "./stripe-ops.js";
import type { LedgerSignup } from "../../../schemas/product/ledger-product.js";
import type { LedgerPlanId, LedgerSubscriptionStatus } from "../../../schemas/product/ledger-product.js";
import type { StripeWebhookEvent } from "./stripe-checkout.js";

export function findTenantIdByStripeCustomer(customerId: string): string | null {
  const needle = customerId.trim();
  if (!needle) return null;
  for (const tenantId of listLedgerProductTenantIds()) {
    const sub = runWithTenantId(tenantId, () => loadLedgerSubscription());
    if (sub?.stripe_customer_id === needle) return tenantId;
  }
  const tenantsDir = getTenantsDir();
  if (!existsSync(tenantsDir)) return null;
  for (const tenantId of listLedgerProductTenantIds()) {
    const path = join(tenantsDir, tenantId, "data/product/subscription.yaml");
    if (!existsSync(path)) continue;
    try {
      const raw = YAML.parse(readFileSync(path, "utf-8")) as {
        stripe_customer_id?: string;
      };
      if (raw.stripe_customer_id === needle) return tenantId;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function mapStripeSubscriptionStatus(status?: string): LedgerSubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "trialing":
      return "trialing";
    default:
      return "active";
  }
}

export function applySubscriptionStatusForTenant(
  tenantId: string,
  status: LedgerSubscriptionStatus,
): void {
  runWithTenantId(tenantId, () => {
    const existing = loadLedgerSubscription();
    if (!existing) return;
    saveLedgerSubscription({
      ...existing,
      status,
      updated_at: new Date().toISOString(),
    });
  });
}

function existingProvisionedCeo(signup: LedgerSignup): string | null {
  if (!isLedgerProductTenant(signup.tenant_id)) return null;
  const control = findControlPlaneTenant(signup.tenant_id);
  if (!control || control.status !== "active" ||
      control.company_name !== signup.company_name || control.plan !== signup.plan) return null;
  return runWithTenantId(signup.tenant_id, () => {
    const subscription = loadLedgerSubscription();
    if (subscription?.admin_email?.toLowerCase() !== signup.admin_email ||
        subscription.company_name !== signup.company_name || subscription.plan !== signup.plan) return null;
    return loadOperatorRegistry()?.operators.find((operator) =>
      operator.role === "ceo" && operator.status === "active" &&
      operator.email?.toLowerCase() === signup.admin_email,
    )?.operator_id ?? null;
  });
}

function successfulProvisionMailExists(signup: LedgerSignup): boolean {
  return listLedgerMailOutbox().some((mail) =>
    mail.kind === "provision_complete" && mail.tenant_id === signup.tenant_id &&
    mail.to.toLowerCase() === signup.admin_email && mail.status === "sent" &&
    (!isProductionEnv() || mail.transport === "smtp"),
  );
}

interface PendingWelcome {
  signup_id: string;
  tenant_id: string;
  setup_url: string;
  expires_at: string;
}

function pendingWelcomePath(signupId: string): string {
  const hash = createHash("sha256").update(signupId).digest("hex");
  return join(getWorkspaceRoot(), "product-fleet", "welcome-pending", `${hash}.json`);
}

function loadPendingWelcome(signup: LedgerSignup): PendingWelcome | null {
  const path = pendingWelcomePath(signup.signup_id);
  if (!existsSync(path)) return null;
  const pending = JSON.parse(readFileSync(path, "utf-8")) as PendingWelcome;
  if (pending.signup_id !== signup.signup_id || pending.tenant_id !== signup.tenant_id) {
    throw new Error(`Pending welcome does not match signup ${signup.signup_id}`);
  }
  if (!Number.isFinite(Date.parse(pending.expires_at)) || !pending.setup_url) {
    throw new Error(`Pending welcome is invalid for signup ${signup.signup_id}`);
  }
  return pending;
}

function savePendingWelcome(pending: PendingWelcome): void {
  const path = pendingWelcomePath(pending.signup_id);
  const dir = join(getWorkspaceRoot(), "product-fleet", "welcome-pending");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const tmp = `${path}.${process.pid}-${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(pending), { mode: 0o600 });
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

const WELCOME_LOCK_STALE_MS = 10 * 60_000;
const WELCOME_LOCK_MARKER_GRACE_MS = 2_000;

interface WelcomeLockOwner {
  pid: number;
  host: string;
  token: string;
}

function welcomeLockOwner(path: string): WelcomeLockOwner | null {
  try {
    const owner = JSON.parse(readFileSync(join(path, "owner.json"), "utf-8")) as WelcomeLockOwner;
    return Number.isInteger(owner.pid) && owner.pid > 0 &&
      typeof owner.host === "string" && typeof owner.token === "string" ? owner : null;
  } catch {
    return null;
  }
}

function welcomeLockAbandoned(path: string, staleMs: number): boolean {
  let age: number;
  try {
    age = Date.now() - statSync(path).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const owner = welcomeLockOwner(path);
  if (!owner) return age > WELCOME_LOCK_MARKER_GRACE_MS;
  if (owner.host === hostname()) {
    try {
      process.kill(owner.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    }
  }
  return age > staleMs;
}

function claimWelcomeLock(path: string, owner: WelcomeLockOwner): boolean {
  try {
    mkdirSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  writeFileSync(join(path, "owner.json"), JSON.stringify(owner), { flag: "wx", mode: 0o600 });
  return true;
}

function releaseWelcomeLock(path: string, owner: WelcomeLockOwner): void {
  if (welcomeLockOwner(path)?.token === owner.token) {
    rmSync(path, { recursive: true, force: true });
  }
}

/** Keep one signup's token mint and welcome delivery together across workers. */
async function withWelcomeDeliveryLock<T>(signupId: string, operation: () => Promise<T>): Promise<T> {
  const locksDir = join(getWorkspaceRoot(), "product-fleet", ".welcome-delivery-locks");
  mkdirSync(locksDir, { recursive: true });
  const lockPath = join(locksDir, createHash("sha256").update(signupId).digest("hex"));
  const owner = { pid: process.pid, host: hostname(), token: randomUUID() };
  const deadline = Date.now() + 60_000;
  for (;;) {
    let acquired = false;
    try {
      // The existing cross-process fleet lock makes stale cleanup and claiming one critical section.
      withLedgerTenantAllocationLock(() => {
        if (welcomeLockAbandoned(lockPath, WELCOME_LOCK_STALE_MS)) {
          rmSync(lockPath, { recursive: true, force: true });
        }
        acquired = claimWelcomeLock(lockPath, owner);
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Tenant ID allocation is already in progress") throw error;
    }
    if (acquired) break;
    if (Date.now() >= deadline) throw new Error(`Welcome delivery is already in progress for ${signupId}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  const heartbeat = setInterval(() => {
    if (welcomeLockOwner(lockPath)?.token !== owner.token) return;
    try {
      const now = new Date();
      utimesSync(lockPath, now, now);
    } catch {
      // A failed heartbeat leaves the lock recoverable after the stale interval.
    }
  }, 10_000);
  heartbeat.unref();
  try {
    return await operation();
  } finally {
    clearInterval(heartbeat);
    releaseWelcomeLock(lockPath, owner);
  }
}

export async function handleStripeWebhookEvent(
  event: StripeWebhookEvent,
  mailSender: typeof sendLedgerMail = sendLedgerMail,
): Promise<{
  handled: boolean;
  tenant_id?: string;
  action?: string;
}> {
  const object = event.data.object as Record<string, unknown>;

  if (event.type === "checkout.session.completed") {
    const signupId = object.client_reference_id as string | undefined;
    if (!signupId) return { handled: false };
    return withWelcomeDeliveryLock(signupId, async () => {
      const signup = findLedgerSignup(signupId);
      if (!signup) {
        return { handled: true, action: "signup_already_provisioned" };
      }
      if (signup.stripe_checkout_session_id && typeof object.id === "string" &&
          object.id !== signup.stripe_checkout_session_id) {
        throw new Error(`Checkout session does not match signup ${signupId}`);
      }
      if (signup.status === "provisioned" && signup.welcome_sent_at) {
        rmSync(pendingWelcomePath(signupId), { force: true });
        return { handled: true, tenant_id: signup.tenant_id, action: "signup_already_provisioned" };
      }
      if (signup.status === "cancelled") throw new Error("Cancelled signup cannot be provisioned");
      if (signup.status === "pending" || signup.status === "checkout") {
        setLedgerSignupStatus(signupId, "paid");
      }
      if (process.env.ORGOS_LEDGER_AUTO_PROVISION === "1") {
        let ceoOperatorId = existingProvisionedCeo(signup);
        if (!ceoOperatorId && isLedgerProductTenant(signup.tenant_id)) {
          throw new Error(`Tenant "${signup.tenant_id}" exists but does not match its paid signup`);
        }
        if (!ceoOperatorId) {
          const provisioned = provisionLedgerTenant({
            tenantId: signup.tenant_id,
            companyName: signup.company_name,
            adminEmail: signup.admin_email,
            plan: signup.plan,
            signupId: signup.signup_id,
            stripeCustomerId: object.customer as string | undefined,
            stripeSubscriptionId: object.subscription as string | undefined,
          });
          ceoOperatorId = provisioned.ceo_operator_id;
        }
        if (successfulProvisionMailExists(signup)) {
          updateLedgerSignup(signupId, { status: "provisioned", welcome_sent_at: getClock().nowIso() });
          rmSync(pendingWelcomePath(signupId), { force: true });
          return { handled: true, tenant_id: signup.tenant_id, action: "provisioned" };
        }
        let pending = loadPendingWelcome(signup);
        if (!pending || Date.parse(pending.expires_at) <= Date.now()) {
          const bootstrap = runWithTenantId(signup.tenant_id, () =>
            mintPasskeyBootstrapToken({ operatorId: ceoOperatorId, ttl: "72h" }),
          );
          const publicBase =
            process.env.ORGOS_PUBLIC_BASE_URL?.trim() ||
            process.env.STEWARD_CHAT_PUBLIC_URL?.trim() ||
            "http://127.0.0.1:8787";
          const setupUrl = new URL(publicBase);
          const tenantHost = findControlPlaneTenant(signup.tenant_id)?.host;
          if (tenantHost) setupUrl.hostname = tenantHost;
          setupUrl.pathname = "/founder-setup/";
          setupUrl.search = "";
          setupUrl.hash = `bootstrap=${encodeURIComponent(bootstrap.token)}`;
          pending = {
            signup_id: signup.signup_id,
            tenant_id: signup.tenant_id,
            setup_url: setupUrl.toString(),
            expires_at: bootstrap.expires_at,
          };
          savePendingWelcome(pending);
        }
        const delivery = await mailSender({
          kind: "provision_complete",
          to: signup.admin_email,
          tenantId: signup.tenant_id,
          companyName: signup.company_name,
          setupUrl: pending.setup_url,
        });
        if (isProductionEnv() && delivery.transport !== "smtp") {
          throw new Error("SMTP delivery is required before marking welcome mail sent in production");
        }
        updateLedgerSignup(signupId, { status: "provisioned", welcome_sent_at: getClock().nowIso() });
        rmSync(pendingWelcomePath(signupId), { force: true });
        return { handled: true, tenant_id: signup.tenant_id, action: "provisioned" };
      }
      return { handled: true, tenant_id: signup.tenant_id, action: "paid" };
    });
  }

  if (event.type === "customer.subscription.updated") {
    const customerId = object.customer as string | undefined;
    const tenantId = customerId ? findTenantIdByStripeCustomer(customerId) : null;
    if (!tenantId) return { handled: false };
    const status = mapStripeSubscriptionStatus(object.status as string | undefined);
    runWithTenantId(tenantId, () => {
      const existing = loadLedgerSubscription();
      if (!existing) return;
      upsertLedgerSubscription({
        plan: existing.plan as LedgerPlanId,
        status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: object.id as string | undefined,
        currentPeriodEnd:
          typeof object.current_period_end === "number"
            ? new Date(object.current_period_end * 1000).toISOString()
            : undefined,
      });
    });
    return { handled: true, tenant_id: tenantId, action: `subscription_${status}` };
  }

  if (event.type === "customer.subscription.deleted") {
    const customerId = object.customer as string | undefined;
    const tenantId = customerId ? findTenantIdByStripeCustomer(customerId) : null;
    if (!tenantId) return { handled: false };
    applySubscriptionStatusForTenant(tenantId, "cancelled");
    return { handled: true, tenant_id: tenantId, action: "subscription_cancelled" };
  }

  if (event.type === "invoice.payment_failed") {
    const customerId = object.customer as string | undefined;
    const tenantId = customerId ? findTenantIdByStripeCustomer(customerId) : null;
    if (!tenantId) return { handled: false };
    applySubscriptionStatusForTenant(tenantId, "past_due");
    const sub = runWithTenantId(tenantId, () => loadLedgerSubscription());
    if (sub?.admin_email) {
      void sendLedgerMail({
        kind: "payment_failed",
        to: sub.admin_email,
        tenantId,
        companyName: sub.company_name ?? tenantId,
      });
    }
    return { handled: true, tenant_id: tenantId, action: "past_due" };
  }

  if (event.type === "invoice.paid") {
    const customerId = object.customer as string | undefined;
    const tenantId = customerId ? findTenantIdByStripeCustomer(customerId) : null;
    if (!tenantId) return { handled: false };
    applySubscriptionStatusForTenant(tenantId, "active");
    return { handled: true, tenant_id: tenantId, action: "active" };
  }

  return { handled: false };
}
