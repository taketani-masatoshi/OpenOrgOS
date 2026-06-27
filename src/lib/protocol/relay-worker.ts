import { type RelayCycleMetrics } from "../../../schemas/protocol/relay-state.js";
import { loadRelayState, saveRelayState } from "./relay-state.js";
import { flushWirePending, deliverProtocolEnvelopeWithRelay } from "./transport.js";
import { flushWitnessPending } from "./witness-client.js";
import { listWirePending } from "./wire-queue.js";
import { listWitnessPending } from "./witness-queue.js";
import { loadPeersRegistry } from "./peers.js";
import { reconcileWitnessWithPeer, reconcileCrossHub, reconcileWitnessWithPeerAndPersist } from "./witness-reconcile.js";
import { evaluateTransactionSla } from "./resilience-sla.js";
import { listTransactions } from "./transactions.js";
import { loadContractById } from "./contract-witness-pool.js";
import type { ResilienceSlaTier } from "../../../schemas/protocol/resilience-sla.js";

export interface RelayCycleResult extends RelayCycleMetrics {
  reconcile_alerts_detail: Array<{ peer_id?: string; code: string; message: string }>;
}

export { loadRelayState, saveRelayState } from "./relay-state.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runRelayCycle(opts?: {
  reconcile?: boolean;
  defaultSlaTier?: ResilienceSlaTier;
}): Promise<RelayCycleResult> {
  const wireFlushed = await flushWirePending();
  const witnessFlushed = await flushWitnessPending();

  const reconcileAlerts: RelayCycleResult["reconcile_alerts_detail"] = [];
  if (opts?.reconcile !== false) {
    for (const peer of loadPeersRegistry().peers) {
      try {
        const result = await reconcileWitnessWithPeerAndPersist({
          peerId: peer.peer_id,
          remoteLedger: true,
        });
        for (const alert of result.alerts) {
          reconcileAlerts.push({
            peer_id: peer.peer_id,
            code: alert.code,
            message: alert.message,
          });
        }
      } catch {
        /* peer reconcile optional */
      }
    }
    try {
      const cross = await reconcileCrossHub();
      for (const alert of cross.alerts) {
        reconcileAlerts.push({ code: alert.code, message: alert.message });
      }
    } catch {
      /* cross-hub optional */
    }
  }

  let slaFailures = 0;
  const tier = opts?.defaultSlaTier ?? "silver";
  for (const tx of listTransactions()) {
    if (tx.direction !== "outbound") continue;
    let evalTier = tier;
    const contractId = tx.refs.contract_id;
    if (contractId) {
      try {
        const contract = loadContractById(contractId);
        evalTier = contract.protocol?.resilience_sla ?? tier;
      } catch {
        /* use default */
      }
    }
    const evaluation = evaluateTransactionSla(tx.event_id, evalTier);
    if (!evaluation.satisfied) slaFailures++;
  }

  const metrics: RelayCycleMetrics = {
    at: new Date().toISOString(),
    wire_flushed: wireFlushed,
    witness_flushed: witnessFlushed,
    wire_pending: listWirePending().length,
    witness_pending: listWitnessPending().length,
    sla_failures: slaFailures,
    reconcile_alerts: reconcileAlerts.length,
  };

  const state = loadRelayState();
  state.last_run_at = metrics.at;
  state.cycles = (state.cycles ?? 0) + 1;
  state.last_metrics = metrics;
  state.history = [...(state.history ?? []), metrics].slice(-48);
  saveRelayState(state);

  return { ...metrics, reconcile_alerts_detail: reconcileAlerts };
}

export interface RelayDaemonOptions {
  intervalMs?: number;
  maxCycles?: number;
  reconcile?: boolean;
}

export async function runRelayDaemon(opts: RelayDaemonOptions = {}): Promise<void> {
  const intervalMs = opts.intervalMs ?? 30_000;
  const maxCycles = opts.maxCycles ?? Number.POSITIVE_INFINITY;
  let cycles = 0;

  while (cycles < maxCycles) {
    const result = await runRelayCycle({ reconcile: opts.reconcile });
    console.log(
      `[relay] wire +${result.wire_flushed} witness +${result.witness_flushed} · pending w=${result.wire_pending} v=${result.witness_pending} · sla_fail=${result.sla_failures}`
    );
    cycles++;
    if (cycles >= maxCycles) break;
    await sleep(intervalMs);
  }
}

export { deliverProtocolEnvelopeWithRelay };
