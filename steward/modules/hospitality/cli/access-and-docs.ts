import {
  hospitalityAccessCodeEntrySchema,
  hospitalityAccessCodesFileSchema,
  hospitalityIdDocEntrySchema,
  hospitalityIdDocIndexFileSchema,
  type HospitalityIdDocEntry,
} from "../../../../schemas/hospitality-ops.js";
import { getClock } from "../../../../src/lib/runtime-context.js";
import { resolveTenantPath } from "../../../../src/lib/tenant.js";
import { currentDate, readYamlFile, writeYamlFile } from "../../../../src/lib/utils.js";
import { loadStays, upsertStay } from "./ops-lib.js";

export const ACCESS_CODES_REL = "data/operations/access-codes.yaml";
export const ID_DOC_INDEX_REL = "data/operations/id-doc-index.yaml";

export function loadAccessCodes() {
  try {
    return readYamlFile(resolveTenantPath(ACCESS_CODES_REL), hospitalityAccessCodesFileSchema);
  } catch {
    return hospitalityAccessCodesFileSchema.parse({ version: 1, entries: [] });
  }
}

export function saveAccessCodes(file: ReturnType<typeof loadAccessCodes>): void {
  writeYamlFile(resolveTenantPath(ACCESS_CODES_REL), hospitalityAccessCodesFileSchema.parse(file));
}

export function setAccessCode(stayId: string, code: string, validFrom?: string, validTo?: string): void {
  const stay = loadStays().stays.find((s) => s.id === stayId);
  if (!stay) throw new Error(`stay not found: ${stayId}`);
  const file = loadAccessCodes();
  const entry = hospitalityAccessCodeEntrySchema.parse({
    stay_id: stayId,
    code,
    valid_from: validFrom,
    valid_to: validTo,
  });
  const entries = [...file.entries.filter((e) => e.stay_id !== stayId), entry];
  saveAccessCodes({ version: 1, entries });
  upsertStay({ ...stay, access_code_set: true });
}

export function loadIdDocIndex() {
  try {
    return readYamlFile(resolveTenantPath(ID_DOC_INDEX_REL), hospitalityIdDocIndexFileSchema);
  } catch {
    return hospitalityIdDocIndexFileSchema.parse({ version: 1, entries: [] });
  }
}

export function saveIdDocIndex(file: ReturnType<typeof loadIdDocIndex>): void {
  writeYamlFile(resolveTenantPath(ID_DOC_INDEX_REL), hospitalityIdDocIndexFileSchema.parse(file));
}

function nextDocId(): string {
  const file = loadIdDocIndex();
  const year = currentDate().slice(0, 4);
  let max = 0;
  for (const e of file.entries) {
    if (e.id.startsWith(`IDDOC-${year}-`)) {
      const n = Number(e.id.slice(`IDDOC-${year}-`.length));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `IDDOC-${year}-${String(max + 1).padStart(3, "0")}`;
}

export function registerIdDoc(input: {
  stayId: string;
  docType: HospitalityIdDocEntry["doc_type"];
  relativePath: string;
  retainedUntil: string;
  notes?: string;
}): HospitalityIdDocEntry {
  const entry = hospitalityIdDocEntrySchema.parse({
    id: nextDocId(),
    stay_id: input.stayId,
    doc_type: input.docType,
    relative_path: input.relativePath,
    retained_until: input.retainedUntil,
    registered_on: currentDate(),
    notes: input.notes,
  });
  const file = loadIdDocIndex();
  saveIdDocIndex({ version: 1, entries: [...file.entries, entry] });
  return entry;
}

export function listIdDocsDuePurge(today = currentDate()): HospitalityIdDocEntry[] {
  return loadIdDocIndex().entries.filter((e) => e.retained_until < today);
}
