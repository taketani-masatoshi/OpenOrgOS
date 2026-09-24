/**
 * Isolated bookkeeping acceptance. Score is bookkeeping-only (not monthly close / filing).
 * 100 = every weighted check passes inside a disposable workspace.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendJournalEntry,
  loadJournalEntries,
  postExpenseClaimJournal,
  saveJournalEntries,
} from "../expense-claim-journal.js";
import { reverseJournalEntry } from "../journal-reverse.js";
import { buildTrialBalance } from "../ledger/trial-balance.js";
import {
  buildOpeningBalancesFromTrialBalance,
  loadOpeningBalances,
  openingBalancesReconcileIssues,
  saveOpeningBalances,
} from "../ledger/opening-balance.js";
import { resolveJournalSourceAccounts } from "../journal-source-accounts.js";
import { getDataDir } from "../../utils.js";
import { clearTenantId, getTenantId, setTenantId } from "../../tenant.js";
import { getTenantsDir, refreshOrgOsPaths } from "../../orgos-paths.js";
import { provisionLedgerTenant } from "../../product/ledger-provision.js";
import { ensureLedgerDemoChartOfAccounts } from "../../product/ledger-coa-ensure.js";

export type BookkeepingCheck = {
  id: string;
  weight: number;
  pass: boolean;
  detail: string;
};

export type BookkeepingAcceptanceResult = {
  isolated: true;
  score: number;
  max_score: number;
  checks: BookkeepingCheck[];
};

function check(id: string, weight: number, pass: boolean, detail: string): BookkeepingCheck {
  return { id, weight, pass, detail };
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tryPost(label: string, fn: () => void): { ok: true } | { ok: false; error: string } {
  try {
    fn();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function runIsolatedBookkeepingAcceptance(): BookkeepingAcceptanceResult {
  const originalWorkspace = process.env.ORGOS_WORKSPACE;
  const originalSkipBackup = process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK;
  const originalMigration = process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
  const originalConsoleLog = console.log;
  const originalTenant = (() => {
    try {
      return getTenantId();
    } catch {
      return null;
    }
  })();
  const workspace = mkdtempSync(join(tmpdir(), "orgos-bookkeeping-acceptance-"));
  const checks: BookkeepingCheck[] = [];

  try {
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = "1";
    delete process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
    console.log = () => undefined;
    refreshOrgOsPaths();
    const tenantId = "bookkeeping-acceptance";
    provisionLedgerTenant({
      tenantId,
      companyName: "Bookkeeping Acceptance KK",
      adminEmail: "ceo@bookkeeping-acceptance.example",
      plan: "business",
    });
    setTenantId(tenantId);
    ensureLedgerDemoChartOfAccounts();
    const sources = resolveJournalSourceAccounts();

    // --- post-rejects-unknown-account ---
    const unknown = tryPost("unknown", () => {
      appendJournalEntry({
        entry_id: "JE-BK-UNKNOWN",
        occurred_at: "2026-09-10T00:00:00.000Z",
        description: "unknown account",
        source: { kind: "manual", authorized_by: "OP-BK" },
        evidence_refs: ["test:unknown"],
        lines: [
          { account_code: "9999", debit_yen: 100, credit_yen: 0, tax_category: "out_of_scope" },
          {
            account_code: sources.bank_control,
            debit_yen: 0,
            credit_yen: 100,
            tax_category: "out_of_scope",
          },
        ],
      });
    });
    checks.push(
      check(
        "post-rejects-unknown-account",
        15,
        !unknown.ok,
        unknown.ok ? "accepted unknown account 9999" : `rejected: ${unknown.error}`,
      ),
    );

    // --- post-requires-pl-tax-category ---
    const missingTax = tryPost("missing-tax", () => {
      appendJournalEntry({
        entry_id: "JE-BK-NO-TAX",
        occurred_at: "2026-09-10T00:00:00.000Z",
        description: "revenue without tax category",
        source: { kind: "manual", authorized_by: "OP-BK" },
        evidence_refs: ["test:no-tax"],
        lines: [
          { account_code: sources.bank_control, debit_yen: 100, credit_yen: 0 },
          { account_code: "4100", debit_yen: 0, credit_yen: 100 },
        ],
      });
    });
    checks.push(
      check(
        "post-requires-pl-tax-category",
        15,
        !missingTax.ok,
        missingTax.ok
          ? "accepted P/L line without tax_category"
          : `rejected: ${missingTax.error}`,
      ),
    );

    // --- expense-tax-fields-persisted ---
    let expensePass = false;
    let expenseDetail = "not run";
    try {
      const posted = postExpenseClaimJournal({
        claimId: "ECL-20260910-001",
        occurredAt: "2026-09-10T12:00:00.000Z",
        receiptId: "RCP-1",
        receiptDigest: "abc",
        allocations: [
          {
            account_code: "5100",
            amount_yen: 1100,
            org_unit_id: "OU-1",
            tax_category: "taxable_10",
            tax_amount_yen: 100,
            invoice_status: "qualified",
            purchase_use: "taxable_only",
            tax_rounding: "floor",
          },
        ],
      });
      const expenseLine = posted.lines.find((line) => line.account_code === "5100");
      expensePass = Boolean(
        expenseLine &&
          expenseLine.tax_amount_yen === 100 &&
          expenseLine.invoice_status === "qualified" &&
          expenseLine.purchase_use === "taxable_only",
      );
      expenseDetail = expensePass
        ? "tax fields persisted on expense line"
        : `missing fields on line: ${JSON.stringify(expenseLine ?? null)}`;
    } catch (error) {
      expenseDetail = error instanceof Error ? error.message : String(error);
    }
    checks.push(check("expense-tax-fields-persisted", 15, expensePass, expenseDetail));

    // --- trial-includes-all-posted ---
    let trialPass = false;
    let trialDetail = "not run";
    try {
      appendJournalEntry({
        entry_id: "JE-BK-TRIAL",
        occurred_at: "2026-09-11T00:00:00.000Z",
        description: "trial sample",
        source: { kind: "manual", authorized_by: "OP-BK" },
        evidence_refs: ["test:trial"],
        lines: [
          {
            account_code: sources.bank_control,
            debit_yen: 500,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "4100",
            debit_yen: 0,
            credit_yen: 500,
            tax_category: "non_taxable",
          },
        ],
      });
      const trial = buildTrialBalance({ asOf: "2026-09-11" });
      const codes = new Set(trial.rows.map((row) => row.account_code));
      const unknown = trial.issues.filter((issue) => issue.includes("Unknown account"));
      trialPass =
        trial.balanced &&
        unknown.length === 0 &&
        codes.has(sources.bank_control) &&
        codes.has("4100");
      trialDetail = trialPass
        ? `balanced; rows=${trial.rows.length}`
        : `balanced=${trial.balanced}; issues=${trial.issues.join("; ")}`;
    } catch (error) {
      trialDetail = error instanceof Error ? error.message : String(error);
    }
    checks.push(check("trial-includes-all-posted", 15, trialPass, trialDetail));

    // --- opening-reconciles ---
    let openingPass = false;
    let openingDetail = "not run";
    try {
      const opening = buildOpeningBalancesFromTrialBalance({
        fiscalYear: "FY2027",
        asOf: "2026-09-11",
        periodStart: "2026-09",
        bsOnly: false,
      });
      saveOpeningBalances(opening);
      const issues = openingBalancesReconcileIssues();
      openingPass = issues.length === 0;
      openingDetail = openingPass ? "opening matches books" : issues.join("; ");
      // Tamper should fail
      if (openingPass && opening.lines[0]) {
        const tampered = {
          ...opening,
          lines: opening.lines.map((line, index) =>
            index === 0
              ? {
                  ...line,
                  debit_yen: line.debit_yen + 1,
                  credit_yen: line.credit_yen,
                }
              : line,
          ),
        };
        saveOpeningBalances(tampered);
        const after = openingBalancesReconcileIssues();
        if (after.length === 0) {
          openingPass = false;
          openingDetail = "tampered opening still reconciled";
        } else {
          saveOpeningBalances(opening);
        }
      }
    } catch (error) {
      openingDetail = error instanceof Error ? error.message : String(error);
      openingPass = false;
    }
    checks.push(check("opening-reconciles", 10, openingPass, openingDetail));

    // --- evidence-hash-when-file ---
    let evidencePass = false;
    let evidenceDetail = "not run";
    try {
      const evidenceDir = join(getDataDir(), "finance", "evidence");
      mkdirSync(evidenceDir, { recursive: true });
      const evidencePath = join(evidenceDir, "receipt.txt");
      writeFileSync(evidencePath, "bookkeeping-evidence\n", "utf-8");
      const digest = sha256File(evidencePath);
      const bad = tryPost("bad-hash", () => {
        appendJournalEntry({
          entry_id: "JE-BK-BAD-HASH",
          occurred_at: "2026-09-12T00:00:00.000Z",
          description: "bad evidence hash",
          source: { kind: "manual", authorized_by: "OP-BK" },
          evidence_refs: ["file:finance/evidence/receipt.txt", "sha256:deadbeef"],
          lines: [
            {
              account_code: sources.bank_control,
              debit_yen: 10,
              credit_yen: 0,
              tax_category: "out_of_scope",
            },
            {
              account_code: "3200",
              debit_yen: 0,
              credit_yen: 10,
              tax_category: "out_of_scope",
            },
          ],
        });
      });
      const good = tryPost("good-hash", () => {
        appendJournalEntry({
          entry_id: "JE-BK-GOOD-HASH",
          occurred_at: "2026-09-12T00:00:00.000Z",
          description: "good evidence hash",
          source: { kind: "manual", authorized_by: "OP-BK" },
          evidence_refs: [
            "file:finance/evidence/receipt.txt",
            `sha256:${digest}`,
          ],
          lines: [
            {
              account_code: sources.bank_control,
              debit_yen: 10,
              credit_yen: 0,
              tax_category: "out_of_scope",
            },
            {
              account_code: "3200",
              debit_yen: 0,
              credit_yen: 10,
              tax_category: "out_of_scope",
            },
          ],
        });
      });
      evidencePass = !bad.ok && good.ok;
      evidenceDetail = evidencePass
        ? "bad hash rejected; good hash accepted"
        : `bad.ok=${bad.ok} good.ok=${good.ok} bad=${bad.ok ? "" : bad.error} good=${good.ok ? "" : good.error}`;
    } catch (error) {
      evidenceDetail = error instanceof Error ? error.message : String(error);
    }
    checks.push(check("evidence-hash-when-file", 10, evidencePass, evidenceDetail));

    // --- reversal-preserves-link ---
    let reversalPass = false;
    let reversalDetail = "not run";
    try {
      appendJournalEntry({
        entry_id: "JE-BK-DEP",
        occurred_at: "2026-09-13T00:00:00.000Z",
        description: "depreciation sample",
        source: { kind: "depreciation", asset_id: "ASSET-001", period: "2026-09" },
        evidence_refs: ["test:dep"],
        lines: [
          {
            account_code: "5100",
            debit_yen: 50,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "1290",
            debit_yen: 0,
            credit_yen: 50,
            tax_category: "out_of_scope",
          },
        ],
      });
      const reversal = reverseJournalEntry({
        entryId: "JE-BK-DEP",
        authorizedBy: "OP-BK",
        occurredAt: "2026-09-13T01:00:00.000Z",
        reversalEntryId: "JE-BK-DEP-REV",
      });
      const saved = appendJournalEntry(reversal, { postedBy: "OP-BK" });
      const kindTracked =
        saved.reversal_of === "JE-BK-DEP" &&
        (saved.description.includes("depreciation") ||
          saved.reversed_source_kind === "depreciation");
      const second = tryPost("double-rev", () => {
        const again = reverseJournalEntry({
          entryId: "JE-BK-DEP",
          authorizedBy: "OP-BK",
          occurredAt: "2026-09-13T02:00:00.000Z",
          reversalEntryId: "JE-BK-DEP-REV-2",
        });
        appendJournalEntry(again, { postedBy: "OP-BK" });
      });
      reversalPass = kindTracked && !second.ok;
      reversalDetail = reversalPass
        ? "reversal linked and duplicate blocked"
        : `tracked=${kindTracked} second.ok=${second.ok}`;
    } catch (error) {
      reversalDetail = error instanceof Error ? error.message : String(error);
    }
    checks.push(check("reversal-preserves-link", 10, reversalPass, reversalDetail));

    // --- ar-ap-needs-counterparty ---
    const arMissing = tryPost("ar-missing", () => {
      appendJournalEntry({
        entry_id: "JE-BK-AR-BAD",
        occurred_at: "2026-09-14T00:00:00.000Z",
        description: "ar without counterparty",
        source: { kind: "manual", authorized_by: "OP-BK" },
        evidence_refs: ["test:ar"],
        lines: [
          {
            account_code: sources.accounts_receivable,
            debit_yen: 200,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "4100",
            debit_yen: 0,
            credit_yen: 200,
            tax_category: "non_taxable",
          },
        ],
      });
    });
    const arOk = tryPost("ar-ok", () => {
      appendJournalEntry({
        entry_id: "JE-BK-AR-OK",
        occurred_at: "2026-09-14T00:00:00.000Z",
        description: "ar with counterparty",
        source: { kind: "manual", authorized_by: "OP-BK" },
        evidence_refs: ["test:ar-ok"],
        lines: [
          {
            account_code: sources.accounts_receivable,
            debit_yen: 200,
            credit_yen: 0,
            tax_category: "out_of_scope",
            counterparty_id: "CP-1",
          },
          {
            account_code: "4100",
            debit_yen: 0,
            credit_yen: 200,
            tax_category: "non_taxable",
          },
        ],
      });
    });
    checks.push(
      check(
        "ar-ap-needs-counterparty",
        5,
        !arMissing.ok && arOk.ok,
        !arMissing.ok && arOk.ok
          ? "AR without counterparty rejected"
          : `missing.ok=${arMissing.ok} ok.ok=${arOk.ok}`,
      ),
    );

    // --- no-silent-migration-rewrite ---
    const blocked = tryPost("migration-blocked", () => {
      saveJournalEntries(
        { version: 1, entries: loadJournalEntries().entries },
        { mode: "migration" },
      );
    });
    process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = "1";
    const allowed = tryPost("migration-allowed", () => {
      saveJournalEntries(
        { version: 1, entries: loadJournalEntries().entries },
        { mode: "migration" },
      );
    });
    delete process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
    checks.push(
      check(
        "no-silent-migration-rewrite",
        5,
        !blocked.ok && allowed.ok,
        !blocked.ok && allowed.ok
          ? "migration requires ORGOS_ALLOW_JOURNAL_MIGRATION"
          : `blocked.ok=${blocked.ok} allowed.ok=${allowed.ok}`,
      ),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (checks.length === 0) {
      checks.push(check("setup", 100, false, detail));
    }
  } finally {
    if (originalWorkspace == null) delete process.env.ORGOS_WORKSPACE;
    else process.env.ORGOS_WORKSPACE = originalWorkspace;
    if (originalSkipBackup == null) delete process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK;
    else process.env.ORGOS_VALIDATE_SKIP_SYSTEM_BACKUP_CHECK = originalSkipBackup;
    if (originalMigration == null) delete process.env.ORGOS_ALLOW_JOURNAL_MIGRATION;
    else process.env.ORGOS_ALLOW_JOURNAL_MIGRATION = originalMigration;
    console.log = originalConsoleLog;
    refreshOrgOsPaths();
    clearTenantId();
    if (originalTenant && existsSync(join(getTenantsDir(), originalTenant, "tenant.yaml"))) {
      setTenantId(originalTenant);
    }
    rmSync(workspace, { recursive: true, force: true });
  }

  const max_score = checks.reduce((sum, row) => sum + row.weight, 0);
  const score = checks.filter((row) => row.pass).reduce((sum, row) => sum + row.weight, 0);
  return { isolated: true, score, max_score, checks };
}
