// @catalog-coverage: full
// @catalog-ids: jp_bank_corporate
import { describe, expect, it } from "vitest";
import {
  arApEntrySchema,
  bankStatementEntrySchema,
  type ReconciliationEvent,
} from "../schemas/jp-bank-corporate.js";
import {
  buildReconciliationAppliedEvent,
  proposeReconciliationMatches,
  replayReconciliation,
} from "../src/lib/jp-bank-corporate/reconciliation.js";
import {
  buildArApAging,
  buildCashflowVariance,
  tieOutBankStatements,
} from "../src/lib/jp-bank-corporate/reports.js";
import {
  buildBankStatementEntries,
  mergeBankStatementEntries,
  parseBankStatementCsv,
} from "../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/bank-statement-import.js";

const ar = arApEntrySchema.parse({
  id: "AR-FIX-001",
  kind: "ar",
  amount: 1000,
  booked_date: "2026-06-01",
  due_date: "2026-06-30",
  counterparty: "Fixture",
  description: "Fixture AR",
  account_id: "BANK-901",
  invoice_id: "INV-FIX-001",
  status: "open",
});

const bank = bankStatementEntrySchema.parse({
  id: "BANK-FIX-001",
  date: "2026-07-01",
  direction: "inflow",
  amount: 400,
  category: "rent",
  description: "Fixture receipt",
  account_id: "BANK-901",
  reference: "AR-FIX-001",
});

function applied(
  id: string,
  amount: number,
  bankId = bank.id,
  arApId = ar.id
): ReconciliationEvent {
  return {
    id,
    type: "reconciliation.applied",
    occurred_at: "2026-07-01T01:00:00.000Z",
    effective_date: "2026-07-01",
    actor_id: "system:test",
    match_mode: "exact_auto",
    allocations: [
      {
        bank_statement_id: bankId,
        ar_ap_id: arApId,
        amount,
      },
    ],
  };
}

describe("jp_bank_corporate reconciliation", () => {
  it("proposes unique-reference partial matches for automatic application", () => {
    const proposals = proposeReconciliationMatches([ar], [bank], []);
    expect(proposals).toEqual([
      expect.objectContaining({
        confidence: "exact",
        amount: 400,
        bank_statement_id: bank.id,
        ar_ap_id: ar.id,
      }),
    ]);
  });

  it("does not rematch statements already covered by an AR/AP baseline snapshot", () => {
    expect(
      proposeReconciliationMatches(
        [arApEntrySchema.parse({ ...ar, paid_amount: 400, status: "partial" })],
        [bank],
        [],
        "2026-07-02",
        "2026-07-01"
      )
    ).toEqual([]);
  });

  it("derives partial AR and matched bank state without mutating source rows", () => {
    const event = buildReconciliationAppliedEvent({
      id: "REC-001",
      occurredAt: "2026-07-01T01:00:00.000Z",
      effectiveDate: "2026-07-01",
      actorId: "system:test",
      matchMode: "exact_auto",
      proposal: proposeReconciliationMatches([ar], [bank], [])[0]!,
    });
    const state = replayReconciliation([ar], [bank], [event]);
    expect(state.errors).toEqual([]);
    expect(state.ar_ap.get(ar.id)).toMatchObject({
      allocated_amount: 400,
      remaining_amount: 600,
      status: "partial",
    });
    expect(state.bank_statements.get(bank.id)).toMatchObject({
      allocated_amount: 400,
      unapplied_amount: 0,
      status: "matched",
    });
    expect(ar.status).toBe("open");
    expect(bank.status).toBe("unmatched");
  });

  it("supports multiple bank rows against one receivable", () => {
    const bank2 = bankStatementEntrySchema.parse({
      ...bank,
      id: "BANK-FIX-002",
      amount: 600,
    });
    const state = replayReconciliation(
      [ar],
      [bank, bank2],
      [applied("REC-001", 400), applied("REC-002", 600, bank2.id)]
    );
    expect(state.errors).toEqual([]);
    expect(state.ar_ap.get(ar.id)?.status).toBe("collected");
    expect(state.ar_ap.get(ar.id)?.remaining_amount).toBe(0);
  });

  it("supports one bank row split across multiple payables", () => {
    const ap1 = arApEntrySchema.parse({
      ...ar,
      id: "AP-FIX-001",
      kind: "ap",
      amount: 250,
      invoice_id: undefined,
    });
    const ap2 = arApEntrySchema.parse({
      ...ap1,
      id: "AP-FIX-002",
      amount: 150,
    });
    const outflow = bankStatementEntrySchema.parse({
      ...bank,
      id: "BANK-FIX-OUT",
      direction: "outflow",
      reference: undefined,
    });
    const event: ReconciliationEvent = {
      ...applied("REC-SPLIT", 250, outflow.id, ap1.id),
      allocations: [
        { bank_statement_id: outflow.id, ar_ap_id: ap1.id, amount: 250 },
        { bank_statement_id: outflow.id, ar_ap_id: ap2.id, amount: 150 },
      ],
    };
    const state = replayReconciliation([ap1, ap2], [outflow], [event]);
    expect(state.errors).toEqual([]);
    expect(state.bank_statements.get(outflow.id)?.status).toBe("matched");
  });

  it("keeps overpayment as unapplied cash", () => {
    const smallAr = arApEntrySchema.parse({ ...ar, amount: 250 });
    const state = replayReconciliation(
      [smallAr],
      [bank],
      [applied("REC-OVER", 250)]
    );
    expect(state.bank_statements.get(bank.id)).toMatchObject({
      status: "partial",
      unapplied_amount: 150,
    });
  });

  it("reverses an allocation with a compensating event", () => {
    const events: ReconciliationEvent[] = [
      applied("REC-001", 400),
      {
        id: "REC-REV-001",
        type: "reconciliation.reversed",
        occurred_at: "2026-07-02T01:00:00.000Z",
        effective_date: "2026-07-02",
        actor_id: "approver-test",
        target_event_id: "REC-001",
        reason: "Fixture correction",
      },
    ];
    const state = replayReconciliation([ar], [bank], events);
    expect(state.errors).toEqual([]);
    expect(state.ar_ap.get(ar.id)?.remaining_amount).toBe(1000);
    expect(state.bank_statements.get(bank.id)?.status).toBe("unmatched");
  });

  it("rejects over-allocation and direction mismatch", () => {
    const tooLarge = replayReconciliation(
      [ar],
      [bank],
      [applied("REC-LARGE", 1001)]
    );
    expect(tooLarge.errors).toContain(
      "REC-LARGE: allocation exceeds remaining amount for AR-FIX-001"
    );
    const ap = arApEntrySchema.parse({ ...ar, id: "AP-FIX", kind: "ap" });
    const wrongDirection = replayReconciliation(
      [ap],
      [bank],
      [applied("REC-WRONG", 100, bank.id, ap.id)]
    );
    expect(wrongDirection.errors[0]).toContain("direction does not match");
  });

  it("builds deterministic aging, tie-out, and variance reports", () => {
    const state = replayReconciliation([ar], [bank], [applied("REC-001", 400)]);
    expect(buildArApAging(state, "2026-08-15")[0]).toMatchObject({
      bucket: "31-60",
      remaining_amount: 600,
    });
    expect(
      tieOutBankStatements(
        {
          currency: "JPY",
          entries: [bank],
          import_batches: [
            {
              id: "BATCH-001",
              fingerprint: "a".repeat(64),
              imported_at: "2026-07-01T01:00:00.000Z",
              adapter: "generic-csv",
              account_id: "BANK-901",
              period_start: "2026-07-01",
              period_end: "2026-07-01",
              opening_balance: 1000,
              closing_balance: 1400,
              entry_ids: [bank.id],
            },
          ],
        },
        {
          as_of: "2026-07-01",
          status: "confirmed",
          currency: "JPY",
          accounts: [{ bank_account_id: "BANK-901", amount: 1400 }],
          total: 1400,
        }
      ).status
    ).toBe("passed");
    expect(
      buildCashflowVariance(
        [
          {
            period_key: "2026-07",
            period_start: "2026-07-01",
            period_end: "2026-07-31",
            direction: "inflow",
            category: "rent",
            description: "planned",
            planned_amount: 1000,
            actual_amount: null,
            forecast_amount: null,
            balance_total: 1000,
            balance_by_account: {},
            source: "ar-ap",
          },
        ],
        [
          {
            period_key: "2026-07",
            period_start: "2026-07-01",
            period_end: "2026-07-31",
            direction: "inflow",
            category: "rent",
            description: "actual",
            planned_amount: 0,
            actual_amount: 400,
            forecast_amount: null,
            balance_total: 400,
            balance_by_account: {},
            source: "import",
          },
        ]
      )[0]?.variance_amount
    ).toBe(-600);
  });

  it("imports reordered CSV rows idempotently using content fingerprints", () => {
    const rows = parseBankStatementCsv(
      [
        "date,direction,amount,category,description,account_id,reference,counterparty",
        "2026-07-01,inflow,400,rent,Receipt,BANK-901,AR-FIX-001,Customer",
        "2026-07-02,outflow,300,other,Payment,BANK-901,AP-FIX-001,Supplier",
      ].join("\n")
    );
    const first = buildBankStatementEntries(rows, {
      importedAt: "2026-07-03T00:00:00.000Z",
    });
    const reordered = buildBankStatementEntries([...rows].reverse(), {
      importedAt: "2026-07-03T00:00:00.000Z",
    });
    expect(reordered.batch.fingerprint).toBe(first.batch.fingerprint);
    expect(reordered.entries.map((entry) => entry.id).sort()).toEqual(
      first.entries.map((entry) => entry.id).sort()
    );
    const empty = {
      currency: "JPY" as const,
      import_batches: [],
      entries: [],
    };
    const once = mergeBankStatementEntries(empty, first.entries, first.batch);
    const twice = mergeBankStatementEntries(
      once.file,
      reordered.entries,
      reordered.batch
    );
    expect(once.added).toBe(2);
    expect(twice).toMatchObject({ added: 0, duplicate_batch: true });
    expect(() => buildBankStatementEntries([])).toThrow(
      "Bank statement CSV contains no data rows"
    );
  });
});
