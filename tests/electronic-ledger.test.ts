import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendJournalEntry } from "../src/lib/finance/expense-claim-journal.js";
import {
  buildElectronicLedgerComplianceReport,
  searchElectronicLedger,
} from "../src/lib/finance/ledger/electronic-ledger.js";
import { renderLedgerExportHttp } from "../src/lib/finance/ledger/journal-export.js";
import { getTenantDir } from "../src/lib/tenant.js";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";

describe("electronic ledger (dencho)", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());

  it("searches by date and amount", () => {
    useFinanceFixtureTenant();
    appendJournalEntry({
      entry_id: "JE-DENCHO-001",
      occurred_at: "2026-09-15T00:00:00.000Z",
      description: "vendor payment ACME",
      posted_at: "2026-09-15T10:00:00.000Z",
      posted_by: "OP-TEST",
      source: { kind: "manual", authorized_by: "OP-TEST" },
      evidence_refs: ["test:dencho"],
      lines: [
        {
          account_code: "5100",
          debit_yen: 5000,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: "1100",
          debit_yen: 0,
          credit_yen: 5000,
          tax_category: "out_of_scope",
        },
      ],
    });
    const hits = searchElectronicLedger({
      from: "2026-09-01",
      to: "2026-09-30",
      minAmountYen: 5000,
      descriptionContains: "ACME",
    });
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.some((h) => h.entry_id === "JE-DENCHO-001")).toBe(true);
  });

  it("compliance report flags missing audit trail", () => {
    useFinanceFixtureTenant();
    const journalPath = join(getTenantDir(), "data/finance/journal-entries.yaml");
    writeFileSync(
      journalPath,
      `version: 1
entries:
  - entry_id: JE-DENCHO-NO-AUDIT
    occurred_at: "2026-09-16T00:00:00.000Z"
    description: legacy
    source:
      kind: manual
      authorized_by: OP-TEST
    evidence_refs:
      - test:dencho-audit
    lines:
      - account_code: "5100"
        debit_yen: 100
        credit_yen: 0
        tax_category: out_of_scope
      - account_code: "1100"
        debit_yen: 0
        credit_yen: 100
        tax_category: out_of_scope
`,
      "utf-8",
    );
    const report = buildElectronicLedgerComplianceReport();
    expect(report.missing_audit_trail).toContain("JE-DENCHO-NO-AUDIT");
  });
});

describe("ledger export http", () => {
  beforeEach(() => resetFixtureJournalEntries());
  afterEach(() => resetFixtureJournalEntries());

  it("renders trial balance csv in memory", () => {
    useFinanceFixtureTenant();
    const out = renderLedgerExportHttp({
      template: "trial-balance-csv",
      asOf: "2026-08-31",
    });
    expect(out.content).toContain("account_code");
    expect(out.filename).toMatch(/trial-balance/);
    expect(out.rowCount).toBeGreaterThan(0);
  });
});
