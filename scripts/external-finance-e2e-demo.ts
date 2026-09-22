import { createServer } from "node:http";
import { externalFinanceTransactionSchema } from "../schemas/finance/external-transaction.js";
import { issueHumanApprovalContext, assertHumanApprovalContext } from "../src/lib/org/human-approval-context.js";
import { externalTransactionIdempotencyKey } from "../src/lib/finance/external-reconciliation.js";
import { mapStripePaymentEvent } from "../src/lib/finance/external-provider-adapters.js";

const tx = externalFinanceTransactionSchema.parse(mapStripePaymentEvent({ id: "evt-e2e", type: "payment_intent.succeeded", created: Math.floor(Date.now() / 1000), data: { object: { id: "pi-e2e", amount_received: 12500, currency: "jpy", billing_details: { name: "Demo Customer" } } } }, "demo")[0]);
const approval = { approval_id: "APR-20260921-001", scope: "finance", status: "pending_approval", proposed_at: new Date().toISOString(), proposed_by: "external-finance-connector", subject_type: "external_finance_reconcile", subject_ref: tx.transaction_id, message: "Demo reconcile", amount: { amount: 12500, currency: "JPY" } } as const;
const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/api/finance/external-transactions") { res.statusCode = 404; res.end(); return; }
  let body = ""; req.on("data", (chunk) => { body += chunk; }); req.on("end", () => { const parsed = JSON.parse(body); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ ok: true, proposal_id: parsed.source_event_id })); });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("demo server failed");
const response = await fetch(`http://localhost:${address.port}/api/finance/external-transactions`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": externalTransactionIdempotencyKey(tx) }, body: JSON.stringify({ mode: "proposal", transaction: tx }) });
const proposal = await response.json();
const context = issueHumanApprovalContext({ approval, operatorId: "OP-DEMO", source: "cli" });
assertHumanApprovalContext({ context, approval, operatorId: "OP-DEMO" });
const ledger = { entry_id: `LEDGER-${tx.transaction_id}`, status: "APPLIED", amount: tx.amount, currency: tx.currency, approved_by: context.operator_id };
console.log(JSON.stringify({ received: response.ok, proposal, approval: "verified", ledger, audit: { event: "external_finance_reconcile.applied", source_event_id: tx.raw_event_id } }));
server.close();
