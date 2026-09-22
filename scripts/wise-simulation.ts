import { simulateWiseSettlementFunds } from "../src/lib/finance/external-provider-adapters.js";

const token = process.env.WISE_SANDBOX_TOKEN?.trim();
if (!token) {
  console.error("WISE_SANDBOX_TOKEN is required; no request was sent");
  process.exit(2);
}
const amount = Number(process.env.WISE_SIMULATION_AMOUNT ?? "1000.5");
const currency = (process.env.WISE_SIMULATION_CURRENCY ?? "GBP").toUpperCase();
await simulateWiseSettlementFunds({ accessToken: token, amount, currency, paymentReference: process.env.WISE_SIMULATION_REFERENCE ?? "BYOPSP_demo-ooo" });
console.log(JSON.stringify({ ok: true, provider: "wise-business", simulation: "settlement.funds" }));
