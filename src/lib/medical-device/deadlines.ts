/**
 * Deadline scan for licenses, device certs, training, CAPA, AE GVP, inquiries, PMS.
 */
import {
  medicalDeviceLicenseRegistryFileSchema,
  medicalDeviceMasterFileSchema,
  type MedicalDeviceLedgerType,
} from "../../../schemas/jp-medical-device.js";
import { daysUntil, loadModuleDataFile } from "../module-business-data.js";
import { currentDate } from "../utils.js";
import { findLedgerByType, isOpenLedgerEntry, loadLedgerEntries } from "./ledger-ops.js";

export const MODULE_ID = "jp_medical_device";

export type DeadlineKind =
  | "license"
  | "device_cert"
  | "training"
  | "capa"
  | "gvp_report"
  | "inquiry"
  | "pms";

export type DeadlineItem = {
  kind: DeadlineKind;
  id: string;
  title: string;
  due: string;
  days: number;
  severity: "overdue" | "soon" | "ok";
  lead_days?: number;
};

const DEFAULT_LICENSE_LEAD = 90;
const DEFAULT_DEVICE_LEAD = 180;
const SOON_WINDOW = 30;

function classify(days: number, leadDays: number): "overdue" | "soon" | "ok" {
  if (days < 0) return "overdue";
  if (days <= leadDays || days <= SOON_WINDOW) return "soon";
  return "ok";
}

function openEntries(type: MedicalDeviceLedgerType): Record<string, unknown>[] {
  const ledger = findLedgerByType(type);
  if (!ledger) return [];
  return loadLedgerEntries(ledger.data_file).filter(isOpenLedgerEntry);
}

export function collectMedicalDeviceDeadlines(opts?: {
  today?: string;
  includeOk?: boolean;
}): DeadlineItem[] {
  const today = opts?.today?.trim() || currentDate();
  const items: DeadlineItem[] = [];

  const licenses = loadModuleDataFile(
    MODULE_ID,
    "license-registry.yaml",
    medicalDeviceLicenseRegistryFileSchema
  );
  for (const lic of licenses?.data.licenses ?? []) {
    if (lic.status !== "active") continue;
    if (!lic.expires_on) {
      items.push({
        kind: "license",
        id: lic.id,
        title: `業許可 ${lic.role} — expires_on 未設定`,
        due: today,
        days: 0,
        severity: "soon",
        lead_days: DEFAULT_LICENSE_LEAD,
      });
      continue;
    }
    const days = daysUntil(lic.expires_on, new Date(`${today}T12:00:00`));
    const severity = classify(days, DEFAULT_LICENSE_LEAD);
    if (!opts?.includeOk && severity === "ok") continue;
    items.push({
      kind: "license",
      id: lic.id,
      title: `業許可 ${lic.role}`,
      due: lic.expires_on,
      days,
      severity,
      lead_days: DEFAULT_LICENSE_LEAD,
    });
  }

  const master = loadModuleDataFile(MODULE_ID, "device-master.yaml", medicalDeviceMasterFileSchema);
  for (const d of master?.data.devices ?? []) {
    if (d.status !== "active" || !d.expires_on) continue;
    const lead = d.renewal_lead_days ?? DEFAULT_DEVICE_LEAD;
    const days = daysUntil(d.expires_on, new Date(`${today}T12:00:00`));
    const severity = classify(days, lead);
    if (!opts?.includeOk && severity === "ok") continue;
    items.push({
      kind: "device_cert",
      id: d.id,
      title: `品目 ${d.name}`,
      due: d.expires_on,
      days,
      severity,
      lead_days: lead,
    });
  }

  for (const e of openEntries("training")) {
    const due = e.next_due_on ? String(e.next_due_on) : null;
    if (!due) continue;
    const days = daysUntil(due, new Date(`${today}T12:00:00`));
    const severity = classify(days, SOON_WINDOW);
    if (!opts?.includeOk && severity === "ok") continue;
    items.push({
      kind: "training",
      id: String(e.id),
      title: `教育 ${String(e.topic ?? e.id)}`,
      due,
      days,
      severity,
    });
  }

  for (const e of openEntries("capa")) {
    const effDue =
      e.effectiveness_check_on &&
      String(e.effectiveness_result ?? "pending") !== "effective"
        ? String(e.effectiveness_check_on)
        : null;
    const due = effDue ?? (e.due_on ? String(e.due_on) : null);
    if (!due) continue;
    const days = daysUntil(due, new Date(`${today}T12:00:00`));
    const severity = classify(days, SOON_WINDOW);
    if (!opts?.includeOk && severity === "ok") continue;
    items.push({
      kind: "capa",
      id: String(e.id),
      title: effDue
        ? `CAPA有効性 ${String(e.title ?? e.id)}`
        : `CAPA ${String(e.title ?? e.id)}`,
      due,
      days,
      severity,
    });
  }

  for (const e of openEntries("adverse_event")) {
    const due = e.gvp_due_on ? String(e.gvp_due_on) : null;
    if (!due) continue;
    if (e.report_filed_on) continue;
    const days = daysUntil(due, new Date(`${today}T12:00:00`));
    const severity = days < 0 ? "overdue" : days <= 7 ? "soon" : "ok";
    if (!opts?.includeOk && severity === "ok") continue;
    items.push({
      kind: "gvp_report",
      id: String(e.id),
      title: `GVP報告 ${String(e.id)}`,
      due,
      days,
      severity,
    });
  }

  for (const e of openEntries("authority_inquiry")) {
    const due = e.due_on ? String(e.due_on) : null;
    if (!due) continue;
    const days = daysUntil(due, new Date(`${today}T12:00:00`));
    const severity = classify(days, SOON_WINDOW);
    if (!opts?.includeOk && severity === "ok") continue;
    items.push({
      kind: "inquiry",
      id: String(e.id),
      title: `当局照会 ${String(e.title ?? e.id)}`,
      due,
      days,
      severity,
    });
  }

  for (const e of openEntries("pms")) {
    const due = e.next_review_on ? String(e.next_review_on) : null;
    if (!due) continue;
    const days = daysUntil(due, new Date(`${today}T12:00:00`));
    const severity = classify(days, SOON_WINDOW);
    if (!opts?.includeOk && severity === "ok") continue;
    items.push({
      kind: "pms",
      id: String(e.id),
      title: `PMS ${String(e.device_id ?? e.id)}`,
      due,
      days,
      severity,
    });
  }

  items.sort((a, b) => a.days - b.days);
  return items;
}
