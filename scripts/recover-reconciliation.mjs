import { parseArgs } from "node:util";
import { setTenantId } from "../src/lib/tenant.ts";
import { recoverPendingReconciliation } from "../src/lib/finance/reconciliation-transaction.ts";

try {
  const { values } = parseArgs({
    options: {
      "confirm-recovery": { type: "boolean" },
      "operator-id": { type: "string" },
      reason: { type: "string" },
      tenant: { type: "string" },
    },
  });
  if (!values.tenant) throw new Error("Explicit --tenant is required");
  setTenantId(values.tenant);
  const result = recoverPendingReconciliation({
    confirm: values["confirm-recovery"],
    operatorId: values["operator-id"],
    reason: values.reason,
    // Keys are never command-line arguments or audit fields.
    operatorKey: process.env.ORGOS_OPERATOR_KEY,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Recovery failed");
  process.exitCode = 1;
}
