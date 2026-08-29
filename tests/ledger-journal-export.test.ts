import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildJournalExportRows,
  exportJournalCsv,
  exportTrialBalanceCsv,
  formatJournalExportCsv,
  JOURNAL_EXPORT_HEADER,
  TRIAL_BALANCE_EXPORT_HEADER,
} from "../src/lib/finance/ledger/journal-export.js";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import { resetFixtureJournalEntries, useFinanceFixtureTenant } from "./helpers/finance-fixture.js";

describe("ledger journal export", () => {
  beforeEach(() => {
    resetFixtureJournalEntries();
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-EXPORT-FIXTURE-001",
      occurred_at: "2026-07-01T00:00:00.000Z",
      description: "export fixture",
      source: { kind: "manual", authorized_by: "test" },
      evidence_refs: ["test:export"],
      lines: [
        { account_code: "5300", debit_yen: 500, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 0, credit_yen: 500, tax_category: "out_of_scope" },
      ],
    });
  });

  it("builds line-level rows from fixture journal entries", () => {
    const rows = buildJournalExportRows({ from: "2026-07-01", to: "2026-07-31" });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      entry_id: expect.stringMatching(/^JE-/),
      account_code: expect.stringMatching(/^\d{4}$/),
    });
    const csv = formatJournalExportCsv(rows);
    expect(csv.startsWith(JOURNAL_EXPORT_HEADER.join(","))).toBe(true);
  });

  it("escapes commas in descriptions", () => {
    const csv = formatJournalExportCsv([
      {
        entry_id: "JE-TEST",
        occurred_at: "2026-08-01",
        description: 'note, with comma',
        account_code: "1100",
        debit_yen: 100,
        credit_yen: 0,
        tax_category: "out_of_scope",
        source_kind: "manual",
        notes: "",
      },
    ]);
    expect(csv).toContain('"note, with comma"');
  });

  describe("exportJournalCsv", () => {
    let tempDir = "";

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "journal-export-"));
    });

    afterEach(() => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    });

    it("writes CSV to output path", () => {
      const output = join(tempDir, "仕訳一覧.csv");
      const result = exportJournalCsv({ output });
      expect(result.rowCount).toBeGreaterThan(0);
      expect(result.entryCount).toBeGreaterThan(0);
      const content = readFileSync(output, "utf-8");
      expect(content.split("\n")[0]).toBe(JOURNAL_EXPORT_HEADER.join(","));
    });
  });

  describe("exportTrialBalanceCsv", () => {
    let tempDir = "";

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "trial-export-"));
    });

    afterEach(() => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    });

    it("writes trial balance CSV", () => {
      const output = join(tempDir, "試算表.csv");
      const result = exportTrialBalanceCsv({ asOf: "2026-08-31", output });
      expect(result.rowCount).toBeGreaterThan(0);
      const content = readFileSync(output, "utf-8");
      expect(content.split("\n")[0]).toBe(TRIAL_BALANCE_EXPORT_HEADER.join(","));
    });
  });
});
