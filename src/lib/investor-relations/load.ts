import { existsSync } from "node:fs";
import {
  capTableFileSchema,
  disclosureCalendarFileSchema,
  investorRegistryFileSchema,
  irMaterialsFileSchema,
} from "../../../schemas/investor-relations/index.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
  resolveModuleDataFile,
} from "../module-business-data.js";
import {
  IR_CAP_TABLE_FILE,
  IR_DISCLOSURE_CALENDAR_FILE,
  IR_INVESTOR_REGISTRY_FILE,
  IR_MATERIALS_FILE,
  IR_DATA_ROOT,
  IR_MODULE_ID,
} from "./constants.js";

const LIVE_FILES = [
  IR_CAP_TABLE_FILE,
  IR_INVESTOR_REGISTRY_FILE,
  IR_DISCLOSURE_CALENDAR_FILE,
  IR_MATERIALS_FILE,
] as const;

const TENANT_LIVE = { source: "tenant-live" as const };

/** True when the tenant has at least one live IR YAML (`.example` does not count). */
export function irDataDirExists(): boolean {
  return LIVE_FILES.some((filename) => existsSync(resolveModuleDataFile(IR_MODULE_ID, filename)));
}

export function loadIrCapTable() {
  return loadModuleDataFile(
    IR_MODULE_ID,
    IR_CAP_TABLE_FILE,
    capTableFileSchema,
    TENANT_LIVE,
  );
}

export function loadIrInvestorRegistry() {
  return loadModuleDataFile(
    IR_MODULE_ID,
    IR_INVESTOR_REGISTRY_FILE,
    investorRegistryFileSchema,
    TENANT_LIVE,
  );
}

export function loadIrDisclosureCalendar() {
  return loadModuleDataFile(
    IR_MODULE_ID,
    IR_DISCLOSURE_CALENDAR_FILE,
    disclosureCalendarFileSchema,
    TENANT_LIVE,
  );
}

export function loadIrMaterials() {
  return loadModuleDataFile(
    IR_MODULE_ID,
    IR_MATERIALS_FILE,
    irMaterialsFileSchema,
    TENANT_LIVE,
  );
}

export function getIrDataDir(): string {
  return getModuleDataDir(IR_MODULE_ID);
}
