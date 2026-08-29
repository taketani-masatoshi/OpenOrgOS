import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { setTenantId } from "../src/lib/tenant.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { buildCustomerUxReadinessReport } from "../src/lib/product/ledger-customer-ux-readiness.js";
import { buildMonthCloseChecklist } from "../src/lib/product/ledger-month-close-checklist.js";
import { postManualJournalEntry } from "../src/lib/product/ledger-manual-entry.js";
import {
  approveJournalProposal,
  enqueueManualJournalProposal,
  listPendingJournalProposals,
} from "../src/lib/product/ledger-proposal-queue.js";
import { ensureLedgerDemoChartOfAccounts } from "../src/lib/product/ledger-coa-ensure.js";
import {
  applyBankCsvColumnMapping,
  decodeBankCsvBytes,
  guessBankCsvColumnMapping,
  importBankStatementCsvText,
  readBankCsvTemplateText,
} from "../src/lib/finance/bank-statement-import-service.js";
import {
  listBankCsvPresets,
  mappingForPresetOrGuess,
} from "../src/lib/finance/bank-csv-presets.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";
import { buildOnboardingReport } from "../src/lib/product/ledger-onboarding.js";
import { applyOnboardingSetup } from "../src/lib/product/ledger-onboarding-setup.js";
import { getDataDir } from "../src/lib/utils.js";

describe("customer UX paths", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  function provisionTemp(id: string) {
    workspace = mkdtempSync(join(tmpdir(), "cux-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: id,
      companyName: "Cux KK",
      adminEmail: "ceo@cux.example",
      plan: "business",
    });
    setTenantId(id);
  }

  it("fails month-close checklist without bank import", () => {
    provisionTemp("cux-cl-001");
    const checklist = buildMonthCloseChecklist("2026-06");
    expect(checklist.items.find((i) => i.id === "bank-imported")?.pass).toBe(false);
    expect(checklist.ready).toBe(false);
    expect(Array.isArray(checklist.integrity_errors)).toBe(true);
  });

  it("posts manual journal and maps bank CSV columns", () => {
    provisionTemp("cux-je-001");
    ensureLedgerDemoChartOfAccounts();
    const posted = postManualJournalEntry({
      description: "事務用品",
      debitAccount: "5100",
      creditAccount: "1100",
      amountYen: 3000,
      authorizedBy: "OP-TEST",
    });
    expect(posted.entry_id).toMatch(/^JE-MANUAL-/);
    expect(loadJournalEntries().entries.length).toBe(1);

    const remapped = applyBankCsvColumnMapping(
      ["取引日,金額,摘要,入出金", "2026-06-15,120000,家賃,入金"].join("\n"),
      {
        date: "取引日",
        amount: "金額",
        description: "摘要",
        direction: "入出金",
      },
    );
    expect(remapped).toContain("inflow");
    const imported = importBankStatementCsvText({
      csvText: remapped,
      write: true,
    });
    expect(imported.added).toBe(1);
    const checklist = buildMonthCloseChecklist("2026-06");
    expect(checklist.items.find((i) => i.id === "bank-imported")?.pass).toBe(true);
  });

  it("serves bank template and guesses JP headers", () => {
    const tpl = readBankCsvTemplateText();
    expect(tpl).toContain("date,direction,amount");
    const guessed = guessBankCsvColumnMapping(
      "取引日,金額,摘要,入出金\n2026-06-01,100,test,入金",
    );
    expect(guessed.date).toBe("取引日");
    expect(guessed.amount).toBe("金額");
  });

  it("queues MCP proposals and approves into journal", () => {
    provisionTemp("cux-prop-001");
    ensureLedgerDemoChartOfAccounts();
    const queued = enqueueManualJournalProposal({
      description: "AI 提案仕訳",
      debitAccount: "5100",
      creditAccount: "1100",
      amountYen: 5000,
      source: "mcp",
    });
    expect(listPendingJournalProposals().some((p) => p.id === queued.id)).toBe(true);
    const approved = approveJournalProposal({
      proposalId: queued.id,
      authorizedBy: "OP-TEST",
    });
    expect(approved.entry_id).toMatch(/^JE-MANUAL-/);
    expect(listPendingJournalProposals().find((p) => p.id === queued.id)).toBeUndefined();
  });

  it("lists bank CSV presets including yucho rakuten two_column", () => {
    const presets = listBankCsvPresets();
    expect(presets.length).toBeGreaterThanOrEqual(7);
    expect(presets.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        "generic",
        "mufg",
        "mizuho",
        "smbc",
        "yucho",
        "rakuten",
        "two_column",
      ]),
    );
    const csv = "取引日,金額,摘要,入出金\n2026-06-01,1000,テスト,入金";
    const mapping = mappingForPresetOrGuess("mizuho", csv);
    expect(mapping.date).toBe("取引日");
    const remapped = applyBankCsvColumnMapping(csv, mapping);
    expect(remapped).toContain("inflow");
  });

  it("decodes Shift_JIS bank CSV bytes", () => {
    const hex =
      "8ee688f893fa2c8be08a7a2c934597762c93fc8f6f8be00a323032362d30362d30312c313030302c8365835883672c93fc8be00a";
    const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
    const decoded = decodeBankCsvBytes(bytes, "auto");
    expect(decoded.encoding_used).toBe("shift_jis");
    expect(decoded.text).toContain("取引日");
    const mapping = mappingForPresetOrGuess("mizuho", decoded.text);
    const remapped = applyBankCsvColumnMapping(decoded.text, mapping);
    expect(remapped).toContain("inflow");
  });

  it("two_column preset maps withdrawal and deposit", () => {
    const csv = "取引日,出金額,入金額,摘要\n2026-06-02,,5000,入金のみ";
    const mapping = mappingForPresetOrGuess("two_column", csv);
    expect(mapping.withdrawal_amount).toBe("出金額");
    expect(mapping.deposit_amount).toBe("入金額");
    const remapped = applyBankCsvColumnMapping(csv, mapping);
    expect(remapped).toContain("inflow");
    expect(remapped).toContain("5000");
  });

  it("dry_run import does not write bank-statements.yaml", () => {
    provisionTemp("cux-dry-001");
    const path = join(getDataDir(), "finance", "bank-statements.yaml");
    const csv = [
      "date,direction,amount,category,description,account_id,reference,counterparty",
      "2026-06-15,inflow,100,rent,test,BANK-001,,",
    ].join("\n");
    const result = importBankStatementCsvText({ csvText: csv, dry_run: true });
    expect(result.dry_run).toBe(true);
    expect(result.added).toBe(1);
    expect(existsSync(path)).toBe(false);
  });

  it("customer_ready v2 requires company setup and first journal", () => {
    provisionTemp("cux-ready-v2");
    expect(buildOnboardingReport().customer_ready).toBe(false);
    applyOnboardingSetup({ companyName: "Ready KK" });
    expect(buildOnboardingReport().customer_ready).toBe(false);
    ensureLedgerDemoChartOfAccounts();
    postManualJournalEntry({
      description: "初回",
      debitAccount: "5100",
      creditAccount: "1100",
      amountYen: 1000,
      authorizedBy: "OP-TEST",
    });
    expect(buildOnboardingReport().customer_ready).toBe(true);
  });

  it("onboarding exposes customer_ready from first-je", () => {
    provisionTemp("cux-ob-001");
    const report = buildOnboardingReport();
    expect(report.customer_ready).toBe(false);
  });

  it("customer-ux readiness exposes six axes with hardened checks", () => {
    const report = buildCustomerUxReadinessReport();
    expect(report.mode).toBe("customer-ux");
    expect(Object.keys(report.axis_scores).length).toBe(6);
    expect(report.checks.find((c) => c.id === "onboard-first-source")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "bank-csv-template-api")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "mcp-queue-proposals")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "force-onboard-incomplete")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "bank-presets-module")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "bank-preset-no-override")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "bank-sjis-or-encoding")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "passkey-onboarding-inline")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "close-inline-approve")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "propose-coa-select")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "playwright-customer-journey")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "legal-v1-1")?.pass).toBe(true);
    expect(report.checks.find((c) => c.id === "invite-mail")?.pass).toBe(true);
    expect(report.checks.find((c) => c.id === "legal-v1-signed")?.pass).toBe(
      true,
    );
    expect(report.checks.find((c) => c.id === "legal-status-honest")?.pass).toBe(
      true,
    );
  });
});
