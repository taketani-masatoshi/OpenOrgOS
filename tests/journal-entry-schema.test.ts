import { describe, expect, it } from "vitest";
import {
  journalEntrySchema,
  normalizeJournalEntry,
  normalizeJournalSource,
} from "../schemas/finance/journal-entry.js";

describe("journalEntrySchema backward compatibility", () => {
  it("accepts legacy expense claim entries without source", () => {
    const legacy = {
      entry_id: "JE-ECL-20260714-001-POST",
      occurred_at: "2026-07-14T10:00:00.000Z",
      description: "Expense claim posted ECL-20260714-001",
      claim_id: "ECL-20260714-001",
      event: "expense_claim_posted",
      evidence_refs: ["receipt:RCP-001"],
      lines: [
        { account_code: "5300", debit_yen: 1000, credit_yen: 0 },
        { account_code: "2100", debit_yen: 0, credit_yen: 1000 },
      ],
    };
    const parsed = journalEntrySchema.parse(legacy);
    expect(parsed.claim_id).toBe("ECL-20260714-001");
    expect(normalizeJournalSource(parsed)?.kind).toBe("expense_claim");
  });

  it("accepts generalized manual source entries", () => {
    const entry = journalEntrySchema.parse({
      entry_id: "JE-MANUAL-001",
      occurred_at: "2026-07-14T10:00:00.000Z",
      description: "Manual adjustment",
      source: { kind: "manual", authorized_by: "ceo" },
      evidence_refs: ["manual:memo-001"],
      lines: [
        { account_code: "5300", debit_yen: 500, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 0, credit_yen: 500, tax_category: "out_of_scope" },
      ],
    });
    expect(normalizeJournalEntry(entry).source?.kind).toBe("manual");
  });

  it("accepts consumption tax refund receipt source", () => {
    const entry = journalEntrySchema.parse({
      entry_id: "JE-CTREF-202603-PRINCIPLE-NET-RCV",
      occurred_at: "2026-06-01T00:00:00.000Z",
      description: "Consumption tax refund received CLAIM-2026-03-principle_net",
      source: {
        kind: "consumption_tax_refund",
        claim_id: "CLAIM-2026-03-principle_net",
        event: "refund_received",
      },
      evidence_refs: ["claim:CLAIM-2026-03-principle_net"],
      lines: [
        { account_code: "1100", debit_yen: 80000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "2170", debit_yen: 0, credit_yen: 80000, tax_category: "out_of_scope" },
      ],
    });
    expect(entry.source?.kind).toBe("consumption_tax_refund");
  });

  it("accepts remittance source", () => {
    const entry = journalEntrySchema.parse({
      entry_id: "JE-REMIT-WITHHOLDING-2026-09",
      occurred_at: "2026-09-28T15:00:00.000Z",
      description: "Remittance withholding 2026-09",
      source: { kind: "remittance", period: "2026-09", obligation: "withholding" },
      evidence_refs: ["remittance:withholding:2026-09"],
      lines: [
        { account_code: "2120", debit_yen: 1000, credit_yen: 0, tax_category: "out_of_scope" },
        { account_code: "1100", debit_yen: 0, credit_yen: 1000, tax_category: "out_of_scope" },
      ],
    });
    expect(entry.source?.kind).toBe("remittance");
  });

  it("rejects unbalanced entries", () => {
    expect(() =>
      journalEntrySchema.parse({
        entry_id: "JE-BAD-001",
        occurred_at: "2026-07-14T10:00:00.000Z",
        description: "bad",
        source: { kind: "manual", authorized_by: "ceo" },
        evidence_refs: ["manual:bad"],
        lines: [
          { account_code: "5300", debit_yen: 100, credit_yen: 0 },
          { account_code: "1100", debit_yen: 0, credit_yen: 90 },
        ],
      }),
    ).toThrow();
  });
});
