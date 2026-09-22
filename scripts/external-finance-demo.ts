import { externalFinanceTransactionSchema } from "../schemas/finance/external-transaction.js";
import { ingestExternalTransaction, deliverOutboxEntry, type OutboxEntry } from "../src/lib/finance/external-connector-runtime.js";
import { mapStripePaymentEvent } from "../src/lib/finance/external-provider-adapters.js";

const payload = {
  id: "evt_demo_001",
  type: "payment_intent.succeeded",
  created: Math.floor(Date.now() / 1000),
  data: { object: { id: "pi_demo_001", amount_received: 12500, currency: "jpy", billing_details: { name: "Demo Customer" } } },
};

const transaction = externalFinanceTransactionSchema.parse(mapStripePaymentEvent(payload, "demo")[0]);
const seen = new Set<string>();
const entries: OutboxEntry[] = [];
const store = { has: async (key: string) => seen.has(key), put: async (key: string) => { seen.add(key); } };
await ingestExternalTransaction(transaction, store, async (entry) => { entries.push(entry); });
await ingestExternalTransaction(transaction, store, async (entry) => { entries.push(entry); });
const delivered = await deliverOutboxEntry(entries[0]!, async (entry) => {
  if (entry.transaction.tenant_id !== "demo") throw new Error("tenant boundary violation");
  console.log(JSON.stringify({ written: true, transaction_id: entry.transaction.transaction_id, amount: entry.transaction.amount, currency: entry.transaction.currency }));
});
console.log(JSON.stringify({ duplicate_suppressed: entries.length === 1, outbox_status: delivered.status }));
