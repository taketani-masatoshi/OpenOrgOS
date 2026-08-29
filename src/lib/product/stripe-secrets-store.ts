import { join } from "node:path";
import { getWorkspaceRoot } from "../orgos-paths.js";
import {
  hydrateEnvFromFile,
  maskSecret,
  readEnvFile,
  writeEnvFile,
} from "../secrets/env-file-store.js";

const STRIPE_ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_BUSINESS",
  "STRIPE_PRICE_ACCOUNTANT",
] as const;

export type StripeEnvKey = (typeof STRIPE_ENV_KEYS)[number];

export type StripeSecretsInput = Partial<Record<StripeEnvKey, string>>;

export type StripeSettingsSnapshot = {
  webhook_path: string;
  mode: "stub" | "test" | "live";
  secret_configured: boolean;
  webhook_secret_configured: boolean;
  commercial_ready: boolean;
  live_ready: boolean;
  secret_key_hint: string | null;
  webhook_secret_hint: string | null;
  price_starter_configured: boolean;
  price_business_configured: boolean;
  price_accountant_configured: boolean;
  attestation: {
    status: string;
    mode: string;
    checked_at?: string;
  };
  storage_path: string;
};

let hydrated = false;

export function stripeSecretsFilePath(): string {
  return join(getWorkspaceRoot(), "data", "product", "stripe-secrets.env");
}

const STRIPE_ENV_HEADER = [
  "# OrgOS Ledger Stripe secrets — gitignored · set via Operator Console or CLI",
  "# Never commit this file.",
] as const;

export function loadStripeSecretsFromFile(): Record<string, string> {
  return readEnvFile(stripeSecretsFilePath());
}

export function maskStripeSecret(value: string): string {
  return maskSecret(value);
}

export function validateStripeSecretKey(value: string): void {
  const key = value.trim();
  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY must start with sk_test_ or sk_live_");
  }
}

export function validateStripeWebhookSecret(value: string): void {
  const key = value.trim();
  if (!key.startsWith("whsec_")) {
    throw new Error("STRIPE_WEBHOOK_SECRET must start with whsec_");
  }
}

/** Env vars from deploy win; file fills gaps (UI-saved secrets). */
export function hydrateStripeEnvFromStore(): void {
  if (hydrated) return;
  hydrated = true;
  hydrateEnvFromFile(stripeSecretsFilePath(), STRIPE_ENV_KEYS);
}

export function resetStripeSecretsHydrationForTest(): void {
  hydrated = false;
}

export function saveStripeSecrets(input: StripeSecretsInput): Record<string, string> {
  const current = loadStripeSecretsFromFile();
  const merged: Record<string, string> = { ...current };

  for (const key of STRIPE_ENV_KEYS) {
    const raw = input[key];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (!value) continue;
    if (key === "STRIPE_SECRET_KEY") validateStripeSecretKey(value);
    if (key === "STRIPE_WEBHOOK_SECRET") validateStripeWebhookSecret(value);
    merged[key] = value;
    process.env[key] = value;
  }

  writeEnvFile(stripeSecretsFilePath(), STRIPE_ENV_KEYS, merged, STRIPE_ENV_HEADER);
  hydrated = true;
  return merged;
}

export function buildStripeSettingsSnapshot(
  webhookPath = "/chat/v1/product/stripe/webhook",
): StripeSettingsSnapshot {
  hydrateStripeEnvFromStore();
  const secret = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  const webhook = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const mode =
    !secret ? "stub" : secret.startsWith("sk_live_") ? "live" : "test";
  const commercialReady = Boolean(secret && webhook);

  return {
    webhook_path: webhookPath,
    mode,
    secret_configured: Boolean(secret),
    webhook_secret_configured: Boolean(webhook),
    commercial_ready: commercialReady,
    live_ready: commercialReady,
    secret_key_hint: secret ? maskStripeSecret(secret) : null,
    webhook_secret_hint: webhook ? maskStripeSecret(webhook) : null,
    price_starter_configured: Boolean(process.env.STRIPE_PRICE_STARTER?.trim()),
    price_business_configured: Boolean(process.env.STRIPE_PRICE_BUSINESS?.trim()),
    price_accountant_configured: Boolean(process.env.STRIPE_PRICE_ACCOUNTANT?.trim()),
    attestation: {
      status: "pending",
      mode,
    },
    storage_path: "data/product/stripe-secrets.env",
  };
}
