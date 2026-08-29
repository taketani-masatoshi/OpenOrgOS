import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  ledgerSubscriptionSchema,
  type LedgerPlanId,
  type LedgerSubscription,
  type LedgerSubscriptionStatus,
} from "../../../schemas/product/ledger-product.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";
import { getClock } from "../runtime-context.js";

function subscriptionPath(): string {
  return join(getDataDir(), "product/subscription.yaml");
}

export function loadLedgerSubscription(): LedgerSubscription | null {
  const path = subscriptionPath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, ledgerSubscriptionSchema);
}

export function saveLedgerSubscription(sub: LedgerSubscription): void {
  mkdirSync(join(getDataDir(), "product"), { recursive: true });
  writeYamlFile(subscriptionPath(), ledgerSubscriptionSchema.parse(sub));
}

export function upsertLedgerSubscription(input: {
  plan: LedgerPlanId;
  status?: LedgerSubscriptionStatus;
  companyName?: string;
  adminEmail?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
}): LedgerSubscription {
  const now = getClock().now().toISOString();
  const existing = loadLedgerSubscription();
  const sub = ledgerSubscriptionSchema.parse({
    version: 1,
    plan: input.plan,
    status: input.status ?? existing?.status ?? "trialing",
    company_name: input.companyName ?? existing?.company_name,
    admin_email: input.adminEmail ?? existing?.admin_email,
    stripe_customer_id: input.stripeCustomerId ?? existing?.stripe_customer_id,
    stripe_subscription_id:
      input.stripeSubscriptionId ?? existing?.stripe_subscription_id,
    trial_ends_at: input.trialEndsAt ?? existing?.trial_ends_at,
    current_period_end: input.currentPeriodEnd ?? existing?.current_period_end,
    updated_at: now,
  });
  saveLedgerSubscription(sub);
  return sub;
}
