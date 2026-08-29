import { createHmac, timingSafeEqual } from "node:crypto";
import type { LedgerPlan } from "./ledger-plans.js";
import { isStripeBillingStubAllowed } from "./stripe-ops.js";

export type CheckoutSessionResult = {
  mode: "live" | "stub";
  session_id: string;
  url: string;
};

function stripeSecret(): string | undefined {
  return process.env.STRIPE_SECRET_KEY?.trim() || undefined;
}

function resolveStripePriceId(plan: LedgerPlan): string | undefined {
  const fromEnv = process.env[plan.stripe_price_env]?.trim();
  return fromEnv || undefined;
}

export async function createLedgerCheckoutSession(input: {
  signupId: string;
  email: string;
  plan: LedgerPlan;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSessionResult> {
  const secret = stripeSecret();
  if (!secret) {
    if (!isStripeBillingStubAllowed()) {
      throw new Error("STRIPE_SECRET_KEY required in production");
    }
    const sessionId = `stub_${input.signupId}`;
    const url = `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}stub_session=${sessionId}`;
    return { mode: "stub", session_id: sessionId, url };
  }

  const priceId = resolveStripePriceId(input.plan);
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("client_reference_id", input.signupId);
  body.set("customer_email", input.email);
  body.set("subscription_data[trial_period_days]", String(input.plan.trial_days));
  if (priceId) {
    body.set("line_items[0][price]", priceId);
    body.set("line_items[0][quantity]", "1");
  } else {
    body.set("line_items[0][price_data][currency]", "jpy");
    body.set(
      "line_items[0][price_data][product_data][name]",
      `OrgOS Ledger ${input.plan.name}`,
    );
    body.set(
      "line_items[0][price_data][unit_amount]",
      String(input.plan.monthly_jpy),
    );
    body.set("line_items[0][price_data][recurring][interval]", "month");
    body.set("line_items[0][quantity]", "1");
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const payload = (await response.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.id || !payload.url) {
    throw new Error(
      payload.error?.message ??
        `Stripe checkout failed (${response.status})`,
    );
  }
  return { mode: "live", session_id: payload.id, url: payload.url };
}

export function verifyStripeWebhookSignature(input: {
  payload: string;
  signatureHeader: string | undefined;
}): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const header = input.signatureHeader;
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((chunk) => {
      const [key, value] = chunk.split("=");
      return [key, value];
    }),
  ) as Record<string, string | undefined>;
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const timestampSec = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSec)) return false;
  const toleranceSec = Number.parseInt(
    process.env.STRIPE_WEBHOOK_TOLERANCE_SEC?.trim() ?? "300",
    10,
  );
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - timestampSec);
  if (ageSec > toleranceSec) return false;
  const signed = `${timestamp}.${input.payload}`;
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(signature, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type StripeWebhookEvent = {
  id?: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

export async function createBillingPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<{ mode: "live" | "stub"; url: string }> {
  const secret = stripeSecret();
  if (!secret) {
    if (!isStripeBillingStubAllowed()) {
      throw new Error("STRIPE_SECRET_KEY required in production");
    }
    return {
      mode: "stub",
      url: `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}billing=stub`,
    };
  }
  const body = new URLSearchParams();
  body.set("customer", input.customerId);
  body.set("return_url", input.returnUrl);
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const payload = (await response.json()) as {
    url?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.url) {
    throw new Error(
      payload.error?.message ??
        `Stripe billing portal failed (${response.status})`,
    );
  }
  return { mode: "live", url: payload.url };
}

export function parseStripeWebhookEvent(payload: string): StripeWebhookEvent {
  return JSON.parse(payload) as StripeWebhookEvent;
}
