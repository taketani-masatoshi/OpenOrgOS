import { formatP0Report, listP0Items } from "../lib/p0-status.js";
import { loadAllData } from "../lib/data.js";
import { scanContractAlerts, formatAlertsTable } from "../lib/alerts.js";
import { computeMaturityReport, formatMaturityReport } from "../lib/maturity.js";
import { buildAnalyticsExecutiveAlertLine } from "../lib/analytics/index.js";

export function runOpsDaily(): void {
  console.log("=== Steward daily (ops) ===\n");

  const maturity = computeMaturityReport();
  console.log(formatMaturityReport(maturity));
  console.log("");

  const analyticsLine = buildAnalyticsExecutiveAlertLine();
  if (analyticsLine) {
    console.log(analyticsLine);
    console.log("");
  }

  console.log(formatP0Report());
  console.log("");

  const data = loadAllData();
  const draftInsurance = data.contracts.filter(
    (c) => c.status === "draft" && (c.type === "insurance" || c.id.startsWith("CTR-01"))
  );
  if (draftInsurance.length) {
    console.log("契約 P0 (draft):");
    for (const c of draftInsurance) {
      console.log(`  ${c.id} ${c.name} — ${c.risk?.risk_level ?? "—"}`);
    }
    console.log("");
  }

  const alerts = scanContractAlerts(data.contracts, 90, "high");
  if (alerts.length) {
    console.log("契約期限（90日 · high）:");
    formatAlertsTable(alerts);
    console.log("");
  }

  const p0Open = listP0Items().filter((i) => i.blocker && i.status !== "done").length;
  if (p0Open === 0) {
    console.log("✓ P0 ブロッカー解消済み");
  } else {
    console.log(`⚠ P0 ブロッカー ${p0Open} 件 — docs/company/p0-closing-register.md 参照`);
  }
}

export function runOpsP0(): void {
  console.log(formatP0Report());
  const items = listP0Items();
  const blockers = items.filter((i) => i.blocker && i.status !== "done");
  process.exit(blockers.length ? 1 : 0);
}
