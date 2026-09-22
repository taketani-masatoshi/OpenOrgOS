import { describe, expect, it } from "vitest";
import { externalFinanceTransactionSchema } from "../schemas/finance/external-transaction.js";
import { externalTransactionIdempotencyKey, reconcileExternalTransaction } from "../src/lib/finance/external-reconciliation.js";

const transaction = externalFinanceTransactionSchema.parse({
  tenant_id: "demo", transaction_id: "evt-1", source: "stripe", type: "INCOME",
  amount: "100", currency: "JPY", payer_or_payee: "ＡＢＣ 株式会社",
  transaction_date: "2026-09-21T00:00:00+09:00", direction: "CREDIT", minor_unit: 0,
  raw_event_id: "raw-1",
});

describe("external finance reconciliation", () => {
  it("matches one eligible candidate", () => {
    expect(reconcileExternalTransaction(transaction, [{ id: "inv-1", tenant_id: "demo", type: "INCOME", direction: "CREDIT", counterparty: "ABC株式会社", amount: "100", currency: "JPY", status: "OPEN" }])).toEqual({ status: "MATCHED", candidate_id: "inv-1", reason: "COUNTERPARTY_AND_AMOUNT" });
  });

  it("excludes other tenants and directions", () => {
    expect(reconcileExternalTransaction(transaction, [{ id: "wrong", tenant_id: "other", type: "INCOME", direction: "CREDIT", counterparty: "ABC株式会社", amount: "100.10", currency: "JPY", status: "OPEN" }, { id: "wrong-type", tenant_id: "demo", type: "EXPENSE", direction: "CREDIT", counterparty: "ABC株式会社", amount: "100.10", currency: "JPY", status: "OPEN" }, { id: "wrong-direction", tenant_id: "demo", type: "INCOME", direction: "DEBIT", counterparty: "ABC株式会社", amount: "100.10", currency: "JPY", status: "OPEN" }])).toEqual({ status: "REVIEW", reason: "NO_CANDIDATE", candidate_ids: [] });
  });

  it("keeps decimal amounts exact", () => {
    expect(reconcileExternalTransaction(transaction, [{ id: "inv-2", tenant_id: "demo", type: "INCOME", direction: "CREDIT", counterparty: "ABC株式会社", amount: "100.100", currency: "JPY", status: "OPEN" }]).status).toBe("MATCHED");
  });

  it("builds a tenant and account scoped idempotency key", () => {
    expect(externalTransactionIdempotencyKey(transaction)).toBe("demo:stripe:default:evt-1");
  });
});
