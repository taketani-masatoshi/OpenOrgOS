import { describe, expect, it, vi } from "vitest";
import { externalFinanceTransactionSchema } from "../schemas/finance/external-transaction.js";
import { deliverOutboxEntry, ingestExternalTransaction, verifyHmacSha256 } from "../src/lib/finance/external-connector-runtime.js";

const tx = externalFinanceTransactionSchema.parse({
  tenant_id: "demo", transaction_id: "evt-1", source: "stripe", type: "INCOME", amount: "100",
  currency: "JPY", payer_or_payee: "ABC", transaction_date: "2026-09-21T00:00:00+09:00",
  direction: "CREDIT", minor_unit: 0, raw_event_id: "raw-1",
});

describe("external connector runtime", () => {
  it("does not enqueue duplicate events", async () => {
    const keys = new Set<string>();
    const enqueue = vi.fn();
    const store = { has: async (key: string) => keys.has(key), put: async (key: string) => { keys.add(key); } };
    expect(await ingestExternalTransaction(tx, store, enqueue)).toMatchObject({ duplicate: false });
    expect(await ingestExternalTransaction(tx, store, enqueue)).toMatchObject({ duplicate: true });
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("verifies HMAC signatures", () => {
    expect(verifyHmacSha256("body", "dc46983557fea127b43af721467eb9b3fde2338fe3e14f51952aa8478c13d355", "secret")).toBe(true);
    expect(verifyHmacSha256("body", "sha256=4f8f1f0f0a4c6f0b8d7a6d4e80e3a4b6c9f2f0c4b7e0a5a1d6b8a4a4f7b0f2d1", "secret")).toBe(false);
    expect(verifyHmacSha256("body", "invalid", "secret")).toBe(false);
  });

  it("marks failed delivery for retry", async () => {
    const result = await deliverOutboxEntry({ id: "x", idempotency_key: "x", transaction: tx, attempts: 0, next_attempt_at: new Date().toISOString(), status: "PENDING" }, async () => { throw new Error("down"); });
    expect(result).toMatchObject({ status: "PENDING", attempts: 1 });
  });
});
