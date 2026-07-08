import {
  daysUntil,
  isModuleEnabled,
  loadModuleDataFile,
  getModuleDataDir,
} from "../../../../src/lib/module-business-data.js";
import {
  saasPlansFileSchema,
  saasSubscriptionsFileSchema,
} from "../../../../schemas/business-modules.js";

export const MODULE_ID = "saas_subscription";

function planMrr(plan: { price_yen?: number; mrr_yen?: number; billing_cycle?: string }): number {
  if (plan.mrr_yen != null) return plan.mrr_yen;
  if (plan.price_yen == null) return 0;
  return plan.billing_cycle === "annual" ? Math.round(plan.price_yen / 12) : plan.price_yen;
}

export function runSaasSubscriptionShow(opts: { json?: boolean }): void {
  const subs = loadModuleDataFile(MODULE_ID, "subscriptions.yaml", saasSubscriptionsFileSchema);
  const plans = loadModuleDataFile(MODULE_ID, "plans.yaml", saasPlansFileSchema);
  const active = subs?.data.subscriptions.filter((s) => s.status === "active") ?? [];
  const planMap = new Map((plans?.data.plans ?? []).map((p) => [p.id, planMrr(p)]));
  let mrr = 0;
  for (const s of active) mrr += planMap.get(s.plan_id) ?? 0;
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    subscriptions: subs?.data.subscriptions.length ?? 0,
    active: active.length,
    mrr_yen: mrr,
    plans: plans?.data.plans.length ?? 0,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# saas_subscription\n`);
  console.log(`active: ${summary.active} · MRR (plan map): ¥${summary.mrr_yen.toLocaleString()} · plans: ${summary.plans}`);
}

export function runSaasSubscriptionValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  const subs = loadModuleDataFile(MODULE_ID, "subscriptions.yaml", saasSubscriptionsFileSchema);
  const plans = loadModuleDataFile(MODULE_ID, "plans.yaml", saasPlansFileSchema);
  if (!subs) issues.push("subscriptions.yaml missing");
  if (!plans) issues.push("plans.yaml missing");
  if (subs && plans) {
    const planIds = new Set(plans.data.plans.map((p) => p.id));
    for (const s of subs.data.subscriptions) {
      if (!planIds.has(s.plan_id)) issues.push(`${s.id}: unknown plan_id ${s.plan_id}`);
    }
  }
  if (issues.length) {
    console.error("✗ saas_subscription:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ saas_subscription — subscriptions/plans OK");
}

export function runSaasSubscriptionAction(_opts: Record<string, unknown>): void {
  const subs = loadModuleDataFile(MODULE_ID, "subscriptions.yaml", saasSubscriptionsFileSchema);
  if (!subs) {
    console.error("subscriptions.yaml not found");
    process.exit(1);
  }
  const horizon = 90;
  console.log(`# Renewals within ${horizon} days\n`);
  let count = 0;
  for (const s of subs.data.subscriptions) {
    if (s.status !== "active" || !s.renews_on) continue;
    const d = daysUntil(s.renews_on);
    if (d >= 0 && d <= horizon) {
      console.log(`- ${s.id} · ${s.plan_id} · renews ${s.renews_on} (${d}d)`);
      count++;
    }
  }
  if (!count) console.log("(none in window)");
}
