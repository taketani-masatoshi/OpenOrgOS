/**
 * Integrity issues for jp_medical_device when the module is enabled.
 */
import {
  medicalDeviceLicenseRegistryFileSchema,
  medicalDeviceMasterFileSchema,
} from "../../../schemas/jp-medical-device.js";
import type { IntegrityIssue } from "../integrity.js";
import { isModuleEnabled, loadModuleDataFile } from "../module-business-data.js";
import { collectMedicalDeviceDeadlines } from "./deadlines.js";
import { findLedgerByType, loadLedgerEntries } from "./ledger-ops.js";

const MODULE_ID = "jp_medical_device";

export function collectMedicalDeviceIntegrityIssues(): IntegrityIssue[] {
  if (!isModuleEnabled(MODULE_ID)) return [];
  const issues: IntegrityIssue[] = [];

  const licenses = loadModuleDataFile(
    MODULE_ID,
    "license-registry.yaml",
    medicalDeviceLicenseRegistryFileSchema
  );
  if (!licenses) {
    issues.push({
      level: "error",
      file: "data/medical-device/license-registry.yaml",
      message: "license-registry.yaml missing",
    });
  } else {
    for (const lic of licenses.data.licenses) {
      if (lic.status === "active" && !lic.expires_on) {
        issues.push({
          level: "error",
          file: "data/medical-device/license-registry.yaml",
          message: `license ${lic.id}: active but expires_on missing`,
        });
      }
    }
  }

  const master = loadModuleDataFile(
    MODULE_ID,
    "device-master.yaml",
    medicalDeviceMasterFileSchema
  );
  const deviceIds = new Set((master?.data.devices ?? []).map((d) => d.id));

  for (const type of [
    "complaint",
    "adverse_event",
    "change_control",
    "distribution",
    "manufacturing_batch",
  ] as const) {
    const ledger = findLedgerByType(type);
    if (!ledger) continue;
    for (const e of loadLedgerEntries(ledger.data_file)) {
      const deviceId = e.device_id ? String(e.device_id) : "";
      if (deviceId && !deviceIds.has(deviceId)) {
        issues.push({
          level: "error",
          file: `data/medical-device/${ledger.data_file}`,
          message: `${type} ${e.id}: unknown device_id ${deviceId}`,
        });
      }
    }
  }

  for (const d of collectMedicalDeviceDeadlines({ includeOk: false })) {
    if (d.severity !== "overdue") continue;
    if (d.kind === "gvp_report" || d.kind === "capa" || d.kind === "inquiry") {
      issues.push({
        level: "error",
        file: "data/medical-device/",
        message: `${d.kind} ${d.id}: overdue (${d.due})`,
      });
    } else {
      issues.push({
        level: "warning",
        file: "data/medical-device/",
        message: `${d.kind} ${d.id}: expired/overdue (${d.due})`,
      });
    }
  }

  return issues;
}
