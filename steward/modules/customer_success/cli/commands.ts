import {
  buildModuleCustomerSuccessView,
  validateCustomerSuccessModuleData,
} from "./lib.js";
import {
  formatCustomerSuccessMarkdown,
} from "../../../../src/lib/customer-success-view.js";

export function runCustomerSuccessShow(opts: { json?: boolean }): void {
  const view = buildModuleCustomerSuccessView({ includeDemo: false });
  if (opts.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatCustomerSuccessMarkdown(view, { showScores: true }));
}

export function runCustomerSuccessValidate(): void {
  const issues = validateCustomerSuccessModuleData();
  if (issues.length) {
    console.error("✗ customer_success:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ customer_success — accounts and module refs OK");
}

export function runCustomerSuccessHealth(opts: { json?: boolean; driftOnly?: boolean }): void {
  const view = buildModuleCustomerSuccessView({
    includeDemo: false,
    driftOnly: opts.driftOnly ?? false,
  });
  if (opts.json) {
    console.log(JSON.stringify({ scored: view.scored, drift_count: view.drift_count }, null, 2));
    return;
  }
  console.log(`# Customer health scores\n`);
  console.log(`drift: ${view.drift_count} · accounts: ${view.scored.length}\n`);
  for (const s of view.scored) {
    console.log(
      `- ${s.account_id} · ${s.company}: score=${s.score} declared=${s.declared} recommended=${s.recommended}${s.drift ? " [DRIFT]" : ""}`,
    );
  }
}

export function runCustomerSuccessOnboarding(opts: { json?: boolean }): void {
  const view = buildModuleCustomerSuccessView({ includeDemo: false });
  if (opts.json) {
    console.log(JSON.stringify(view.onboarding_overdue, null, 2));
    return;
  }
  console.log(`# Onboarding overdue\n`);
  if (view.onboarding_overdue.length === 0) {
    console.log("(none)");
    return;
  }
  for (const o of view.onboarding_overdue) {
    console.log(
      `- ${o.company} (${o.account_id}): ${o.milestone_key} · ${o.days_overdue}d overdue`,
    );
  }
}

export function runCustomerSuccessNps(opts: { json?: boolean }): void {
  const view = buildModuleCustomerSuccessView({ includeDemo: false });
  if (opts.json) {
    console.log(JSON.stringify(view.nps, null, 2));
    return;
  }
  const n = view.nps;
  console.log(`# NPS summary\n`);
  console.log(
    `responses: ${n.responses} · promoters: ${n.promoters} · passives: ${n.passives} · detractors: ${n.detractors}`,
  );
  if (n.nps != null) {
    console.log(`NPS: ${n.nps}`);
  }
}
