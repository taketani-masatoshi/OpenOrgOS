import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  medicalDeviceLicenseRegistryFileSchema,
  medicalDeviceMasterFileSchema,
  type MedicalDeviceBusinessRole,
} from "../../../../../../schemas/jp-medical-device.js";
import type { z } from "zod";
import { loadCompany } from "../../../../../../src/lib/data.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import { currentDate } from "../../../../../../src/lib/utils.js";

export const MODULE_ID = "jp_medical_device";

export const ROLE_LABELS: Record<MedicalDeviceBusinessRole, string> = {
  manufacturing: "製造業",
  mah: "製造販売業",
  distribution: "販売業",
};

export function loadYaml<T>(rel: string, schema: z.ZodType<T>): { path: string; data: T } | null {
  const loaded = loadModuleDataFile(MODULE_ID, rel, schema);
  if (!loaded) return null;
  return { path: loaded.path, data: loaded.data };
}

export function resolveTemplatePath(templateRel: string): string | null {
  const seedDir = getModuleSeedDir(MODULE_ID);
  const seedPath = join(seedDir, templateRel);
  if (existsSync(seedPath)) return seedPath;
  const dataDir = getModuleDataDir(MODULE_ID);
  const dataPath = join(dataDir, templateRel);
  if (existsSync(dataPath)) return dataPath;
  return null;
}

export function loadCompanySnapshot() {
  const company = loadCompany();
  return {
    name: company.name,
    representative: company.representative ?? "（代表者名）",
    address: company.address,
    business_description: company.business_description,
  };
}

export function loadDevicesSummary(): string {
  const master = loadYaml("device-master.yaml", medicalDeviceMasterFileSchema);
  if (!master?.data.devices.length) return "（device-master.yaml に製品を登録）";
  return master.data.devices.map((d) => `${d.name}（${d.class}類）`).join(" · ");
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  out = out.replace(/\{\{company\.name\}\}/g, vars["company.name"] ?? "");
  out = out.replace(/\{\{company\.representative\}\}/g, vars["company.representative"] ?? "");
  out = out.replace(/\{\{device\.name\}\}/g, vars["device.name"] ?? "（製品名）");
  return out;
}

export function buildTemplateVars(docNumber: string, deviceName?: string, extra?: Record<string, string>) {
  const snap = loadCompanySnapshot();
  const licenses = loadYaml("license-registry.yaml", medicalDeviceLicenseRegistryFileSchema);
  const roles =
    licenses?.data.licenses.map((l) => ROLE_LABELS[l.role]).join(" · ") ?? "製造 · 製造販売 · 販売";
  const master = loadYaml("device-master.yaml", medicalDeviceMasterFileSchema);
  const device = deviceName
    ? master?.data.devices.find((d) => d.name === deviceName || d.id === deviceName)
    : master?.data.devices[0];
  return {
    "company.name": snap.name,
    "company.representative": snap.representative,
    doc_number: docNumber,
    effective_date: currentDate(),
    business_roles: roles,
    device_scope: loadDevicesSummary(),
    "device.name": device?.name ?? deviceName ?? "（製品名）",
    "device.id": device?.id ?? "",
    "device.class": device?.class ?? "",
    "device.jmdn_code": device?.jmdn_code ?? "",
    "device.approval_number": device?.approval_number ?? "",
    "device.regulatory_pathway": device?.regulatory_pathway ?? "",
    "device.general_name": device?.general_name ?? "",
    ...extra,
  };
}

