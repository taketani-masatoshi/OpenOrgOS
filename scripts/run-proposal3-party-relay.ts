#!/usr/bin/env node
/**
 * Proposal 3 — party relay daemon (Mac mini / southwood · mal).
 * Runs protocol relay run — pulls Org C inbox + pushes outbox on interval.
 */
import { runProtocolRelayRun } from "../src/commands/protocol.js";
import { setTenantId } from "../src/lib/tenant.js";

const tenantId = process.argv[2] ?? process.env.ORGOS_TENANT;
if (!tenantId) {
  console.error("Usage: npm run proposal3:party-relay -- <tenant>  (mal | southwood)");
  process.exit(1);
}

setTenantId(tenantId);
await runProtocolRelayRun({
  tenant: tenantId,
  intervalSec: Number(process.env.RELAY_INTERVAL_SEC ?? 30),
});
