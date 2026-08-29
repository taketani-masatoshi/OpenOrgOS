/**
 * Check device-master fields needed for application drafts (L1 completeness).
 */
import type { MedicalDeviceApplicationKind, MedicalDeviceMasterEntry } from "../../../schemas/jp-medical-device.js";
import { medicalDeviceMasterFileSchema } from "../../../schemas/jp-medical-device.js";
import { loadModuleDataFile } from "../module-business-data.js";

const MODULE_ID = "jp_medical_device";

const PLACEHOLDER = /[（(].*[）)]|^$/;

function isMissing(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  if (PLACEHOLDER.test(value.trim())) return true;
  return false;
}

export function assessDeviceApplicationCompleteness(
  device: MedicalDeviceMasterEntry,
  kind: MedicalDeviceApplicationKind
): { ok: boolean; missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (isMissing(device.name)) missing.push("name");
  if (isMissing(device.general_name)) missing.push("general_name");
  if (isMissing(device.jmdn_code)) missing.push("jmdn_code");
  if (!device.regulatory_pathway) missing.push("regulatory_pathway");

  if (kind === "certification" || kind === "partial-change") {
    if (isMissing(device.approval_number)) warnings.push("approval_number（既取得時）");
    if (kind === "certification" && isMissing(device.certification_body)) {
      warnings.push("certification_body");
    }
  }
  if (kind === "notification" && device.class !== "I") {
    warnings.push(`class=${device.class}（届出は主に I 類）`);
  }
  if (!device.expires_on && (kind === "certification" || kind === "partial-change")) {
    warnings.push("expires_on（更新期限）");
  }

  return { ok: missing.length === 0, missing, warnings };
}

export function assessApplicationForDeviceId(
  deviceId: string | undefined,
  kind: MedicalDeviceApplicationKind
): {
  device: MedicalDeviceMasterEntry | null;
  ok: boolean;
  missing: string[];
  warnings: string[];
} {
  const master = loadModuleDataFile(MODULE_ID, "device-master.yaml", medicalDeviceMasterFileSchema);
  const device = deviceId
    ? master?.data.devices.find((d) => d.id === deviceId) ?? null
    : master?.data.devices[0] ?? null;
  if (!device) {
    return {
      device: null,
      ok: false,
      missing: ["device (device-master.yaml)"],
      warnings: [],
    };
  }
  const result = assessDeviceApplicationCompleteness(device, kind);
  return { device, ...result };
}
