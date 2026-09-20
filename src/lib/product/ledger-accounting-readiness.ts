/**
 * Scoped accounting readiness.
 * The score proves bookkeeping and close operations through an isolated runtime
 * acceptance. It does not claim statutory-return completion or e-Tax submission.
 */
import { runValidateReport } from "../../commands/validate.js";
import { buildElectronicLedgerComplianceReport } from "../finance/ledger/electronic-ledger.js";
import { runWithTenantId } from "../tenant.js";
import {
  runIsolatedAccountingAcceptance,
  type AccountingAcceptanceResult,
} from "./ledger-accounting-acceptance.js";
import { buildFleetHealthReport } from "./ledger-fleet-health.js";
import { listActiveLedgerProductTenantIds } from "./ledger-product-tenant.js";

export type AccountingReadinessCheck = {
  id: string;
  gate: "A0" | "A1" | "A2" | "A3";
  label: string;
  weight: number;
  pass: boolean;
  detail?: string;
};

function pickPilotTenantId(): string | null {
  const ids = listActiveLedgerProductTenantIds();
  return (
    ids.find((id) => id === "pilot-ledger-001") ??
    ids.find((id) => id.startsWith("pilot-ledger-")) ??
    ids[0] ??
    null
  );
}

export function buildAccountingReadinessChecks(
  acceptance: AccountingAcceptanceResult = runIsolatedAccountingAcceptance(),
): AccountingReadinessCheck[] {
  const fleet = buildFleetHealthReport();
  const pilotId = pickPilotTenantId();
  let pilotValidateOk = false;
  let denchoOk = false;
  let pilotDetail = "no active pilot tenant";

  if (pilotId) {
    runWithTenantId(pilotId, () => {
      const report = runValidateReport({ warnings: true });
      pilotValidateOk = report.ok;
      try {
        const dencho = buildElectronicLedgerComplianceReport();
        denchoOk = dencho.issues.length === 0 && dencho.append_only_ok;
      } catch {
        denchoOk = false;
      }
      pilotDetail = `${pilotId}: validate=${report.ok ? "ok" : "fail"}`;
    });
  }

  const activeHealthy = fleet.tenant_count > 0 && fleet.healthy_count === fleet.tenant_count;
  return [
    {
      id: "runtime-journal",
      gate: "A0",
      label: "Isolated tenant: provision → full-year journals",
      weight: 15,
      pass: acceptance.journal.pass,
      detail: acceptance.journal.detail,
    },
    {
      id: "runtime-bank-reconcile",
      gate: "A1",
      label: "Isolated tenant: bank import → reconcile → journal",
      weight: 15,
      pass: acceptance.bank_reconcile.pass,
      detail: acceptance.bank_reconcile.detail,
    },
    {
      id: "runtime-monthly-close",
      gate: "A1",
      label: "Isolated tenant: 12-month close and evidence locks",
      weight: 25,
      pass: acceptance.monthly_close.pass,
      detail: acceptance.monthly_close.detail,
    },
    {
      id: "runtime-annual-close",
      gate: "A2",
      label: "Isolated tenant: annual close and opening-balance cutover",
      weight: 20,
      pass: acceptance.annual_close.pass,
      detail: acceptance.annual_close.detail,
    },
    {
      id: "runtime-consumption-tax",
      gate: "A2",
      label: "Consumption tax: filing draft, statutory rates, adjustments, national/local split, and rounding",
      weight: 15,
      pass: acceptance.consumption_tax.pass,
      detail: acceptance.consumption_tax.detail,
    },
    {
      id: "fleet-active-healthy",
      gate: "A0",
      label: "Active fleet all healthy (drill excluded)",
      weight: 4,
      pass: activeHealthy,
      detail: `${fleet.healthy_count}/${fleet.tenant_count} (${fleet.scope})`,
    },
    {
      id: "pilot-validate",
      gate: "A1",
      label: "Pilot tenant validate green",
      weight: 3,
      pass: pilotValidateOk,
      detail: pilotDetail,
    },
    {
      id: "dencho-basic",
      gate: "A1",
      label: "Dencho basic compliance green on pilot",
      weight: 3,
      pass: denchoOk,
      detail: pilotId ?? "no pilot",
    },
  ];
}

export function buildAccountingReadinessReport() {
  const acceptance = runIsolatedAccountingAcceptance();
  const checks = buildAccountingReadinessChecks(acceptance);
  const weighted = checks.filter((row) => row.weight > 0);
  const earned = weighted.filter((row) => row.pass).reduce((sum, row) => sum + row.weight, 0);
  const total = weighted.reduce((sum, row) => sum + row.weight, 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;

  let gate = "A0";
  if (score >= 95) gate = "A2";
  else if (score >= 85) gate = "A1";

  return {
    score,
    max_score: 100 as const,
    gate_estimate: gate,
    mode: "accounting" as const,
    score_kind: "scoped_implementation_readiness" as const,
    checked_at: new Date().toISOString(),
    checks,
    acceptance,
    fleet: buildFleetHealthReport(),
    scope: {
      completion_claim: "帳簿、月次・年度締め、税理士handoff準備まで",
      excluded: [
        "法人税等の確定仕訳",
        "法定申告書の完成",
        "e-Tax / eLTAXへの提出",
        "税理士または代表者による最終確認・署名",
      ],
    },
    note: "スコープ限定の実装readiness。100点でもA2を上限とし、法定申告、専門家承認、電子提出の完了を意味しません。",
  };
}
