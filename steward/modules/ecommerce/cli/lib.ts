import { isModuleEnabled, loadModuleDataFile } from "../../../../src/lib/module-business-data.js";
import { ecommerceOrdersFileSchema } from "../../../../schemas/business-modules.js";

export const MODULE_ID = "ecommerce";

export function runEcommerceShow(opts: { json?: boolean }): void {
  const orders = loadModuleDataFile(MODULE_ID, "orders.yaml", ecommerceOrdersFileSchema);
  const pending =
    orders?.data.orders.filter((o) => o.status === "paid" || o.status === "pending") ?? [];
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    orders: orders?.data.orders.length ?? 0,
    pending_fulfillment: pending.length,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# ecommerce\n`);
  console.log(`orders: ${summary.orders} · pending fulfillment: ${summary.pending_fulfillment}`);
}

export function runEcommerceValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled");
  const orders = loadModuleDataFile(MODULE_ID, "orders.yaml", ecommerceOrdersFileSchema);
  if (!orders) issues.push("orders.yaml missing");
  else {
    for (const o of orders.data.orders) {
      if (!o.lines.length) issues.push(`${o.id}: empty lines`);
    }
  }
  if (issues.length) {
    console.error("✗ ecommerce:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ ecommerce — orders OK");
}

export function runEcommerceAction(_opts: Record<string, unknown>): void {
  const orders = loadModuleDataFile(MODULE_ID, "orders.yaml", ecommerceOrdersFileSchema);
  if (!orders) {
    console.error("orders.yaml not found");
    process.exit(1);
  }
  console.log("# Pending fulfillment\n");
  for (const o of orders.data.orders.filter((x) => x.status === "paid" || x.status === "pending")) {
    const total = o.lines.reduce((s, l) => s + l.qty * l.unit_price_yen, 0);
    console.log(`- ${o.id} · ${o.customer_id} · ${o.ordered_on} · ¥${total.toLocaleString()} · ${o.status}`);
  }
}
