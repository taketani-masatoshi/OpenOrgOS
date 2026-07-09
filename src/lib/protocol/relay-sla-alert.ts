/**
 * Relay SLA alert evaluation (W4-4).
 */
import type { RelayState } from "../../../schemas/protocol/relay-state.js";

export const RELAY_SLA_THRESHOLDS = {
  maxWirePending: 10,
  maxWitnessPending: 10,
  maxSlaFailures: 0,
  maxReconcileAlerts: 5,
  staleMinutes: 60,
} as const;

export type RelaySlaAlert = {
  code: string;
  severity: "warning" | "critical";
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
};

export function evaluateRelaySlaAlerts(state: RelayState, now = Date.now()): RelaySlaAlert[] {
  const alerts: RelaySlaAlert[] = [];
  const metrics = state.last_metrics;

  if (state.last_run_at) {
    const ageMin = (now - Date.parse(state.last_run_at)) / 60_000;
    if (ageMin > RELAY_SLA_THRESHOLDS.staleMinutes) {
      alerts.push({
        code: "relay-stale",
        severity: "critical",
        message: `Relay last run ${Math.round(ageMin)}m ago (threshold ${RELAY_SLA_THRESHOLDS.staleMinutes}m)`,
        metric: "last_run_age_min",
        value: ageMin,
        threshold: RELAY_SLA_THRESHOLDS.staleMinutes,
      });
    }
  }

  if (!metrics) return alerts;

  if (metrics.wire_pending > RELAY_SLA_THRESHOLDS.maxWirePending) {
    alerts.push({
      code: "wire-pending-high",
      severity: "warning",
      message: `wire_pending=${metrics.wire_pending} exceeds ${RELAY_SLA_THRESHOLDS.maxWirePending}`,
      metric: "wire_pending",
      value: metrics.wire_pending,
      threshold: RELAY_SLA_THRESHOLDS.maxWirePending,
    });
  }

  if (metrics.witness_pending > RELAY_SLA_THRESHOLDS.maxWitnessPending) {
    alerts.push({
      code: "witness-pending-high",
      severity: "warning",
      message: `witness_pending=${metrics.witness_pending} exceeds ${RELAY_SLA_THRESHOLDS.maxWitnessPending}`,
      metric: "witness_pending",
      value: metrics.witness_pending,
      threshold: RELAY_SLA_THRESHOLDS.maxWitnessPending,
    });
  }

  if (metrics.sla_failures > RELAY_SLA_THRESHOLDS.maxSlaFailures) {
    alerts.push({
      code: "sla-failures",
      severity: "critical",
      message: `sla_failures=${metrics.sla_failures} (threshold ${RELAY_SLA_THRESHOLDS.maxSlaFailures})`,
      metric: "sla_failures",
      value: metrics.sla_failures,
      threshold: RELAY_SLA_THRESHOLDS.maxSlaFailures,
    });
  }

  if (metrics.reconcile_alerts > RELAY_SLA_THRESHOLDS.maxReconcileAlerts) {
    alerts.push({
      code: "reconcile-alerts-high",
      severity: "warning",
      message: `reconcile_alerts=${metrics.reconcile_alerts} exceeds ${RELAY_SLA_THRESHOLDS.maxReconcileAlerts}`,
      metric: "reconcile_alerts",
      value: metrics.reconcile_alerts,
      threshold: RELAY_SLA_THRESHOLDS.maxReconcileAlerts,
    });
  }

  return alerts;
}
