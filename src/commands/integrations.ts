import { computeIntegrationsStatus } from "../lib/integrations-status.js";
import { getTenantId } from "../lib/tenant.js";

export function runIntegrationsStatus(opts: { json?: boolean }): void {
  const report = computeIntegrationsStatus(getTenantId());
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Integrations status · ${report.tenant} · ${report.score_pct}%`);
  if (report.setup_completed_at) {
    console.log(`  setup completed: ${report.setup_completed_at}`);
  }
  console.log("");
  for (const item of report.items) {
    console.log(`  ${item.ok ? "✓" : "○"} ${item.id}: ${item.detail}`);
  }
}
