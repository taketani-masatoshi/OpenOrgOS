import { existsSync } from "node:fs";
import type { ReconcileAlert } from "./witness-reconcile.js";
import {
  reconcileAlertsStoreSchema,
  type ReconcileAlertRecord,
  type ReconcileAlertsStore,
} from "../../../schemas/protocol/reconcile-alerts.js";
import { getReconcileAlertsYamlPath } from "./paths.js";
import { currentDate, readYamlFile, writeYamlFile } from "../utils.js";

const ESCALATION_THRESHOLD = 3;

export function loadReconcileAlertsStore(): ReconcileAlertsStore {
  const path = getReconcileAlertsYamlPath();
  if (!existsSync(path)) {
    return reconcileAlertsStoreSchema.parse({ alerts: [] });
  }
  return readYamlFile(path, reconcileAlertsStoreSchema);
}

export function saveReconcileAlertsStore(store: ReconcileAlertsStore): void {
  writeYamlFile(getReconcileAlertsYamlPath(), { ...store, as_of: currentDate() });
}

function alertKey(code: string, eventId?: string, peerId?: string): string {
  return [code, eventId ?? "", peerId ?? ""].join("|");
}

export function persistAndEscalateAlerts(
  alerts: ReconcileAlert[],
  peerId?: string
): ReconcileAlertRecord[] {
  const store = loadReconcileAlertsStore();
  const now = new Date().toISOString();
  const records: ReconcileAlertRecord[] = [];

  for (const alert of alerts) {
    const key = alertKey(alert.code, alert.event_id, peerId);
    const occurrence =
      store.alerts.filter((a) => alertKey(a.code, a.event_id, a.peer_id) === key).length + 1;
    let severity = alert.severity;
    let escalated = false;
    if (occurrence >= ESCALATION_THRESHOLD && alert.severity !== "error") {
      severity = alert.severity === "warning" ? "error" : "critical";
      escalated = true;
    } else if (occurrence >= ESCALATION_THRESHOLD * 2 && alert.severity === "error") {
      severity = "critical";
      escalated = true;
    }

    const record: ReconcileAlertRecord = {
      at: now,
      severity,
      code: alert.code,
      message: alert.message,
      event_id: alert.event_id,
      peer_id: peerId,
      escalated,
      occurrence_count: occurrence,
    };
    records.push(record);
    store.alerts.push(record);
  }

  store.alerts = store.alerts.slice(-500);
  saveReconcileAlertsStore(store);
  return records;
}

export function listEscalatedAlerts(since?: string): ReconcileAlertRecord[] {
  return loadReconcileAlertsStore().alerts.filter((a) => {
    if (!a.escalated) return false;
    if (since && a.at.slice(0, 10) < since) return false;
    return true;
  });
}

export function countOpenReconcileAlerts(): number {
  const store = loadReconcileAlertsStore();
  const cutoff = Date.now() - 7 * 24 * 3_600_000;
  return store.alerts.filter((a) => new Date(a.at).getTime() >= cutoff).length;
}
