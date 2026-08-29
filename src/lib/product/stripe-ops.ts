import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getInstallRoot, getWorkspaceRoot } from "../orgos-paths.js";
import { getClock } from "../runtime-context.js";
import { hydrateStripeEnvFromStore } from "./stripe-secrets-store.js";

const stripeOpsSchema = z.object({
  version: z.literal(1).default(1),
  /** Secrets live in env / secret manager — never stored here. */
  status: z.enum(["pending", "configured"]),
  mode: z.enum(["stub", "test", "live"]).default("stub"),
  webhook_path: z.string().default("/chat/v1/product/stripe/webhook"),
  checked_at: z.string().datetime().optional(),
  note: z.string().optional(),
});

export type StripeOpsRecord = z.infer<typeof stripeOpsSchema>;

function stripeOpsPath(): string {
  return join(getWorkspaceRoot(), "product-fleet", "stripe-ops.yaml");
}

export function loadStripeOps(): StripeOpsRecord {
  const path = stripeOpsPath();
  if (!existsSync(path)) {
    return stripeOpsSchema.parse({ version: 1, status: "pending", mode: "stub" });
  }
  return stripeOpsSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function stripeSecretConfigured(): boolean {
  hydrateStripeEnvFromStore();
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function stripeWebhookSecretConfigured(): boolean {
  hydrateStripeEnvFromStore();
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function detectStripeMode(): "stub" | "test" | "live" {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!key) return "stub";
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_")) return "live";
  return "test";
}

/** Code + docs path for Stripe billing (no secrets required). */
export function isStripeBillingOpsPathReady(): boolean {
  const root = getInstallRoot();
  return (
    existsSync(join(root, "deploy/product/stripe.md")) &&
    existsSync(join(root, "deploy/product/.env.ledger.example")) &&
    existsSync(join(root, "src/lib/product/stripe-checkout.ts")) &&
    existsSync(join(root, "src/lib/product/stripe-ops.ts"))
  );
}

/**
 * Live/test keys present in the process environment, or an ops attestation
 * file written after secrets were installed outside git.
 */
export function isStripeBillingLiveReady(): boolean {
  if (stripeSecretConfigured() && stripeWebhookSecretConfigured()) return true;
  const ops = loadStripeOps();
  return ops.status === "configured" && (ops.mode === "test" || ops.mode === "live");
}

/** Commercial claim: real secrets required — attestation alone is not enough. */
export function isStripeBillingCommercialReady(): boolean {
  return stripeSecretConfigured() && stripeWebhookSecretConfigured();
}

export function isProductionEnv(): boolean {
  return process.env.ORGOS_ENV?.trim() === "production";
}

/** In production, unsigned webhooks are always rejected (no stub mode). */
export function isStripeWebhookStubAllowed(): boolean {
  if (isProductionEnv()) return false;
  return !stripeWebhookSecretConfigured();
}

/** In production, checkout / billing portal stub URLs are rejected. */
export function isStripeBillingStubAllowed(): boolean {
  if (isProductionEnv()) return false;
  return !stripeSecretConfigured();
}

export function buildStripeBillingStatus() {
  const mode = detectStripeMode();
  const ops = loadStripeOps();
  return {
    ops_path_ready: isStripeBillingOpsPathReady(),
    secret_configured: stripeSecretConfigured(),
    webhook_secret_configured: stripeWebhookSecretConfigured(),
    mode,
    attestation: ops,
    live_ready: isStripeBillingLiveReady(),
    commercial_ready: isStripeBillingCommercialReady(),
    webhook_path: "/chat/v1/product/stripe/webhook",
    next_steps: stripeBillingNextSteps(mode, ops),
  };
}

export function stripeBillingNextSteps(
  mode: "stub" | "test" | "live" = detectStripeMode(),
  ops: StripeOpsRecord = loadStripeOps(),
): string[] {
  const steps: string[] = [];
  if (!stripeSecretConfigured()) {
    steps.push("Set STRIPE_SECRET_KEY (sk_live_ for live self-serve; sk_test_ for staging)");
  } else if (mode === "test") {
    steps.push("Replace sk_test_ with sk_live_ when opening self-serve live checkout");
  }
  if (!stripeWebhookSecretConfigured()) {
    steps.push("Set STRIPE_WEBHOOK_SECRET and point Stripe to /chat/v1/product/stripe/webhook");
  }
  if (ops.status !== "configured") {
    steps.push("Run orgos ledger product stripe-attest after keys are in env (secrets stay out of git)");
  }
  if (isProductionEnv() && mode !== "live") {
    steps.push("ORGOS_ENV=production rejects stub Checkout — live keys required");
  }
  if (steps.length === 0) {
    steps.push("Checkout / Customer Portal / webhook are live-ready");
  }
  return steps;
}

/** Same text as Console `next_steps`, for doctor / commercial readiness. */
export function stripeNextStepsDetail(
  mode: "stub" | "test" | "live" = detectStripeMode(),
  ops: StripeOpsRecord = loadStripeOps(),
): string {
  return stripeBillingNextSteps(mode, ops).join(" · ");
}

/**
 * Write attestation after verifying env keys (secrets never written to disk).
 */
export function attestStripeBilling(input?: { note?: string }): StripeOpsRecord {
  if (!stripeSecretConfigured() || !stripeWebhookSecretConfigured()) {
    throw new Error(
      "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be set before attesting",
    );
  }
  const record = stripeOpsSchema.parse({
    version: 1,
    status: "configured",
    mode: detectStripeMode(),
    webhook_path: "/chat/v1/product/stripe/webhook",
    checked_at: getClock().now().toISOString(),
    note: input?.note ?? "Keys verified in environment; not stored in git",
  });
  mkdirSync(join(getWorkspaceRoot(), "product-fleet"), { recursive: true });
  writeFileSync(stripeOpsPath(), YAML.stringify(record), "utf-8");
  return record;
}
