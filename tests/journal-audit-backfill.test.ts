import { describe, expect, it, beforeEach } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  resetFixtureJournalEntries,
  useFinanceFixtureTenant,
} from "./helpers/finance-fixture.js";
import { getTenantDir } from "../src/lib/tenant.js";
import {
  appendJournalEntry,
  loadJournalEntries,
  saveJournalEntries,
} from "../src/lib/finance/expense-claim-journal.js";
import { backfillJournalAuditTrail } from "../src/lib/finance/journal-audit-backfill.js";
import { journalEntrySchema } from "../schemas/finance/journal-entry.js";

describe("journal audit backfill", () => {
  beforeEach(() => {
    resetFixtureJournalEntries();
  });

  it("fills posted_at/posted_by on legacy entries", () => {
    useFinanceFixtureTenant();
    const base = join(getTenantDir(), "data/finance/journal-entries.yaml");
    writeFileSync(
      base,
      `version: 1
entries:
  - entry_id: JE-LEGACY-001
    occurred_at: 2026-09-01T00:00:00.000Z
    description: legacy
    source:
      kind: manual
      authorized_by: ceo
    evidence_refs:
      - test:legacy
    lines:
      - account_code: "1100"
        debit_yen: 100
        credit_yen: 0
        tax_category: out_of_scope
      - account_code: "4100"
        debit_yen: 0
        credit_yen: 100
        tax_category: out_of_scope
`,
      "utf-8",
    );

    const result = backfillJournalAuditTrail();
    expect(result.updated_entries).toBe(1);

    const loaded = loadJournalEntries();
    expect(loaded.entries[0]?.posted_by).toBe("ceo");
    expect(loaded.entries[0]?.posted_at).toContain("2026-09-01");
  });

  it("rejects saveJournalEntries when entries already exist", () => {
    useFinanceFixtureTenant();
    appendJournalEntry(
      journalEntrySchema.parse({
        entry_id: "JE-GUARD-001",
        occurred_at: "2026-09-15T00:00:00.000Z",
        description: "guard test",
        source: { kind: "manual", authorized_by: "ceo" },
        evidence_refs: ["test:guard"],
        lines: [
          {
            account_code: "1100",
            debit_yen: 1,
            credit_yen: 0,
            tax_category: "out_of_scope",
          },
          {
            account_code: "4100",
            debit_yen: 0,
            credit_yen: 1,
            tax_category: "out_of_scope",
          },
        ],
      }),
    );

    expect(() =>
      saveJournalEntries({ version: 1, entries: [] }),
    ).toThrow(/append-only/);
  });
});
