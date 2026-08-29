/**
 * Accounting commercial readiness — distinct from product (P0–P4) and ops commercial (C0–C3).
 * Measures: healthy books, bank reconcile, month close, dencho basic, tax handoff (no e-Tax submit).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";
import { runValidateReport } from "../../commands/validate.js";
import { loadJournalEntries } from "../finance/expense-claim-journal.js";
import { loadChartOfAccounts } from "../data.js";
import { buildElectronicLedgerComplianceReport } from "../finance/ledger/electronic-ledger.js";
import { runWithTenantId } from "../tenant.js";
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

function fileExists(rel: string): boolean {
  return existsSync(join(getInstallRoot(), rel));
}

function sourceIncludes(rel: string, needles: string[]): boolean {
  const path = join(getInstallRoot(), rel);
  if (!existsSync(path)) return false;
  const src = readFileSync(path, "utf-8");
  return needles.every((needle) => src.includes(needle));
}

function pickPilotTenantId(): string | null {
  const ids = listActiveLedgerProductTenantIds();
  return (
    ids.find((id) => id === "pilot-ledger-001") ??
    ids.find((id) => id.startsWith("pilot-ledger-")) ??
    ids[0] ??
    null
  );
}

export function buildAccountingReadinessChecks(): AccountingReadinessCheck[] {
  const fleet = buildFleetHealthReport();
  const pilotId = pickPilotTenantId();

  let pilotValidateOk = false;
  let journalCount = 0;
  let hasJournalSource = false;
  let denchoOk = false;
  let pilotDetail = "no active pilot tenant";

  if (pilotId) {
    runWithTenantId(pilotId, () => {
      const report = runValidateReport({ warnings: true });
      pilotValidateOk = report.ok;
      journalCount = loadJournalEntries().entries.length;
      try {
        const coa = loadChartOfAccounts();
        hasJournalSource = Boolean(coa.journal_source_accounts);
      } catch {
        hasJournalSource = false;
      }
      try {
        const dencho = buildElectronicLedgerComplianceReport();
        denchoOk = dencho.issues.length === 0 && dencho.append_only_ok;
      } catch {
        denchoOk = false;
      }
      pilotDetail = `${pilotId}: journals=${journalCount}, validate=${report.ok ? "ok" : "fail"}`;
    });
  }

  const activeHealthy =
    fleet.tenant_count > 0 && fleet.healthy_count === fleet.tenant_count;

  const checks: AccountingReadinessCheck[] = [
    {
      id: "accounting-module",
      gate: "A0",
      label: "Accounting readiness module",
      weight: 3,
      pass: fileExists("src/lib/product/ledger-accounting-readiness.ts"),
    },
    {
      id: "coa-seed-resolve",
      gate: "A0",
      label: "Demo seed resolves COA (no orphan fixed codes)",
      weight: 8,
      pass:
        sourceIncludes("src/lib/product/ledger-seed-demo-year.ts", [
          "resolveDemoYearAccountCodes",
          "ensureLedgerDemoChartOfAccounts",
        ]) &&
        sourceIncludes("src/lib/product/ledger-coa-ensure.ts", [
          "ensureLedgerDemoChartOfAccounts",
        ]),
    },
    {
      id: "fleet-active-healthy",
      gate: "A0",
      label: "Active fleet all healthy (drill excluded)",
      weight: 10,
      pass: activeHealthy,
      detail: `${fleet.healthy_count}/${fleet.tenant_count} (${fleet.scope})`,
    },
    {
      id: "pilot-validate",
      gate: "A1",
      label: "Pilot tenant validate green",
      weight: 12,
      pass: pilotValidateOk,
      detail: pilotDetail,
    },
    {
      id: "pilot-year-journals",
      gate: "A1",
      label: "Pilot has posted journals (>0)",
      weight: 8,
      pass: journalCount > 0,
      detail: pilotDetail,
    },
    {
      id: "pilot-journal-source",
      gate: "A1",
      label: "Pilot COA has journal_source_accounts",
      weight: 6,
      pass: hasJournalSource,
      detail: pilotDetail,
    },
    {
      id: "bank-e2e-path",
      gate: "A1",
      label: "Bank import→reconcile E2E path",
      weight: 10,
      pass:
        fileExists("src/lib/product/ledger-bank-e2e.ts") &&
        sourceIncludes("src/lib/product/ledger-bank-e2e.ts", [
          "runBankImportReconcileE2E",
        ]) &&
        fileExists("tests/accounting-bank-e2e.test.ts"),
    },
    {
      id: "month-close-path",
      gate: "A1",
      label: "Period lock + comparative + month-close checklist",
      weight: 8,
      pass:
        fileExists("src/lib/finance/period-lock.ts") &&
        fileExists("src/lib/finance/ledger/comparative-statements.ts") &&
        fileExists("src/lib/product/ledger-month-close-checklist.ts"),
    },
    {
      id: "dencho-basic",
      gate: "A1",
      label: "Dencho basic compliance green on pilot",
      weight: 5,
      pass: denchoOk,
      detail: pilotId ?? "no pilot",
    },
    {
      id: "first-journal-fallback",
      gate: "A2",
      label: "First JE onboarding fallback (COA-safe)",
      weight: 6,
      pass:
        fileExists("src/lib/product/ledger-first-journal.ts") &&
        sourceIncludes("src/lib/steward-chat/routes/ledger-api.ts", [
          "onboarding-first",
          "postFirstOnboardingJournal",
        ]),
    },
    {
      id: "tax-handoff",
      gate: "A2",
      label: "Tax handoff package (no e-Tax submit CTA)",
      weight: 6,
      pass:
        fileExists("src/lib/tax/tax-handoff-package.ts") &&
        sourceIncludes("src/lib/tax/tax-handoff-package.ts", [
          "not-for-etax",
        ]) &&
        sourceIncludes("apps/steward-chat/src/TaxHandoffPage.tsx", [
          "e-Tax 提出不可",
        ]),
    },
    {
      id: "guest-accountant",
      gate: "A2",
      label: "Accountant guest-setup channel",
      weight: 4,
      pass:
        sourceIncludes("src/lib/steward-chat/routes/product-api.ts", [
          "/chat/v1/product/guest-setup",
        ]) && fileExists("apps/steward-chat/src/GuestSetupPage.tsx"),
    },
    {
      id: "bonus-to-journal",
      gate: "A3",
      label: "Bonus draft → journal post skeleton",
      weight: 5,
      pass: sourceIncludes("src/lib/finance/payroll-bonus-yea.ts", [
        "postBonusDraftJournal",
      ]),
    },
    {
      id: "month-close-ui",
      gate: "A3",
      label: "Month-close checklist in Workbench API/UI",
      weight: 5,
      pass:
        sourceIncludes("src/lib/steward-chat/routes/ledger-api.ts", [
          "month-close-checklist",
        ]) &&
        sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
          "monthCloseChecklist",
        ]),
    },
    {
      id: "dencho-premium-copy",
      gate: "A3",
      label: "Dencho premium SKU badge/copy consistent",
      weight: 4,
      pass:
        sourceIncludes("apps/steward-chat/src/LedgerWorkbenchPage.tsx", [
          "denchoPremiumBadge",
        ]) &&
        sourceIncludes("src/lib/product/dencho-premium-sku.ts", [
          "優良要件",
        ]),
    },
  ];

  return checks;
}

export function buildAccountingReadinessReport() {
  const checks = buildAccountingReadinessChecks();
  const weighted = checks.filter((row) => row.weight > 0);
  const earned = weighted
    .filter((row) => row.pass)
    .reduce((sum, row) => sum + row.weight, 0);
  const total = weighted.reduce((sum, row) => sum + row.weight, 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;

  let gate = "A0";
  if (score >= 100) gate = "A3";
  else if (score >= 95) gate = "A2";
  else if (score >= 85) gate = "A1";
  else if (score >= 70) gate = "A0";

  return {
    score,
    max_score: 100 as const,
    gate_estimate: gate,
    mode: "accounting" as const,
    checked_at: new Date().toISOString(),
    checks,
    fleet: buildFleetHealthReport(),
    note:
      "経理商用ゲート — 製品 readiness / 課金 commercial とは独立。legal-signed は含めない。",
  };
}
