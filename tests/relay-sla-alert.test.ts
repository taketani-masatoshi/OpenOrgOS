import { describe, it, expect } from "vitest";
import { evaluateRelaySlaAlerts, RELAY_SLA_THRESHOLDS } from "../src/lib/protocol/relay-sla-alert.js";
import type { RelayState } from "../schemas/protocol/relay-state.js";

describe("relay SLA alert (W4-4)", () => {
  it("returns no alerts when metrics within thresholds", () => {
    const state: RelayState = {
      last_run_at: new Date().toISOString(),
      cycles: 1,
      last_metrics: {
        at: new Date().toISOString(),
        wire_flushed: 0,
        witness_flushed: 0,
        wire_pending: 0,
        witness_pending: 0,
        sla_failures: 0,
        reconcile_alerts: 0,
        relay_pulled: 0,
      },
      history: [],
    };
    expect(evaluateRelaySlaAlerts(state)).toHaveLength(0);
  });

  it("alerts on high wire_pending and sla_failures", () => {
    const state: RelayState = {
      last_run_at: new Date().toISOString(),
      cycles: 5,
      last_metrics: {
        at: new Date().toISOString(),
        wire_flushed: 0,
        witness_flushed: 0,
        wire_pending: RELAY_SLA_THRESHOLDS.maxWirePending + 1,
        witness_pending: 0,
        sla_failures: 2,
        reconcile_alerts: 0,
        relay_pulled: 0,
      },
      history: [],
    };
    const alerts = evaluateRelaySlaAlerts(state);
    expect(alerts.some((a) => a.code === "wire-pending-high")).toBe(true);
    expect(alerts.some((a) => a.code === "sla-failures")).toBe(true);
  });

  it("alerts when relay is stale", () => {
    const stale = new Date(Date.now() - (RELAY_SLA_THRESHOLDS.staleMinutes + 5) * 60_000).toISOString();
    const state: RelayState = {
      last_run_at: stale,
      cycles: 1,
      history: [],
    };
    expect(evaluateRelaySlaAlerts(state).some((a) => a.code === "relay-stale")).toBe(true);
  });
});
