/** Relay worker and SLA command handlers. */
import { applyProtocolTenant } from "./shared.js";
import { listTransactions } from "../../lib/protocol/core/transactions.js";
import { evaluateTransactionSla } from "../../lib/protocol/transport/resilience-sla.js";
import { join } from "node:path";


export interface ProtocolRelayOnceOptions {
  tenant?: string;
  json?: boolean;
  noReconcile?: boolean;
}

export async function runProtocolRelayOnce(opts: ProtocolRelayOnceOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { runRelayCycle } = await import("../../lib/protocol/distribution/relay-worker.js");
  const { withGovGatewayDeliver } = await import("../../lib/wire/gov-gateway/transport-bind.js");
  const result = await runRelayCycle({
    reconcile: !opts.noReconcile,
    deliver: withGovGatewayDeliver(),
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `✓ relay cycle · wire +${result.wire_flushed} witness +${result.witness_flushed} · pending w=${result.wire_pending} v=${result.witness_pending} · sla_fail=${result.sla_failures}`
  );
}

export interface ProtocolRelayRunOptions {
  tenant?: string;
  intervalSec?: number;
  maxCycles?: number;
  noReconcile?: boolean;
}

export async function runProtocolRelayRun(opts: ProtocolRelayRunOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { runRelayDaemon } = await import("../../lib/protocol/distribution/relay-worker.js");
  const { withGovGatewayDeliver } = await import("../../lib/wire/gov-gateway/transport-bind.js");
  await runRelayDaemon({
    intervalMs: (opts.intervalSec ?? 30) * 1000,
    maxCycles: opts.maxCycles,
    reconcile: !opts.noReconcile,
    deliver: withGovGatewayDeliver(),
  });
}

export interface ProtocolRelayStatusOptions {
  tenant?: string;
  json?: boolean;
}

export async function runProtocolRelayStatus(opts: ProtocolRelayStatusOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { loadRelayState } = await import("../../lib/protocol/distribution/relay-worker.js");
  const { listWirePending } = await import("../../lib/protocol/transport/wire-queue.js");
  const { listWitnessPending } = await import("../../lib/protocol/distribution/witness-queue.js");
  const state = loadRelayState();
  const body = {
    cycles: state.cycles,
    last_run_at: state.last_run_at,
    last_metrics: state.last_metrics,
    wire_pending: listWirePending().length,
    witness_pending: listWitnessPending().length,
  };
  if (opts.json) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  console.log(
    `relay status · cycles=${body.cycles} · wire_pending=${body.wire_pending} · witness_pending=${body.witness_pending}`
  );
  if (body.last_run_at) console.log(`  last run: ${body.last_run_at}`);
}

export interface ProtocolSlaCheckOptions {
  eventId?: string;
  tier?: "bronze" | "silver" | "gold";
  tenant?: string;
  json?: boolean;
}

export function runProtocolSlaCheck(opts: ProtocolSlaCheckOptions): void {
  applyProtocolTenant(opts.tenant);
  const tier = opts.tier ?? "silver";
  if (opts.eventId) {
    const evaluation = evaluateTransactionSla(opts.eventId, tier);
    if (opts.json) {
      console.log(JSON.stringify(evaluation, null, 2));
      return;
    }
    console.log(`SLA ${tier} · ${evaluation.event_id}: ${evaluation.satisfied ? "OK" : "FAIL"} (${evaluation.state})`);
    if (evaluation.missing.length) console.log(`  missing: ${evaluation.missing.join(", ")}`);
    if (!evaluation.satisfied) process.exit(1);
    return;
  }
  const evaluations = listTransactions()
    .filter((t) => t.direction === "outbound")
    .map((t) => evaluateTransactionSla(t.event_id, tier));
  if (opts.json) {
    console.log(JSON.stringify(evaluations, null, 2));
    return;
  }
  const failed = evaluations.filter((e) => !e.satisfied);
  console.log(`SLA ${tier}: ${evaluations.length - failed.length}/${evaluations.length} satisfied`);
  for (const f of failed) {
    console.log(`  ✗ ${f.event_id} missing ${f.missing.join(", ")}`);
  }
  if (failed.length) process.exit(1);
}

