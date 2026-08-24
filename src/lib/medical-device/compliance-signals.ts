/**
 * Specialized fulfilment signals for jp_medical_device (md-qms / md-gvp).
 * L1 only — no permit numbers, personal names, or product detail in outputs.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  medicalDeviceGvpCatalogFileSchema,
  medicalDeviceLedgerRegistryFileSchema,
  medicalDeviceQmsCatalogFileSchema,
  type MedicalDeviceGvpCatalogFile,
  type MedicalDeviceQmsCatalogFile,
} from "../../../schemas/jp-medical-device.js";
import { loadModuleDataFile } from "../module-business-data.js";
import { loadEnabledModulesSafe } from "../modules.js";
import { getDocsDir } from "../utils.js";

const MODULE_ID = "jp_medical_device";

const ledgerFileSchema = z.object({
  version: z.union([z.literal(1), z.literal("1")]).optional(),
  entries: z.array(z.record(z.unknown())).default([]),
});

export function isMedicalDeviceModuleEnabled(): boolean {
  return loadEnabledModulesSafe().some(
    (m) => m.id === MODULE_ID || m.agent === MODULE_ID
  );
}

export type DocCoverage = {
  id: string;
  title: string;
  tier?: string;
  present: boolean;
  file_hint?: string;
};

export type LedgerSignal = {
  id: string;
  type: string;
  title: string;
  entry_count: number;
  open_count: number;
};

export type QmsSignals = {
  enabled: boolean;
  compliance_type_id: "md-qms";
  documents: DocCoverage[];
  missing_required: DocCoverage[];
  covered: number;
  required: number;
  document_control_entries: number;
};

export type GvpSignals = {
  enabled: boolean;
  compliance_type_id: "md-gvp";
  documents: DocCoverage[];
  missing_required: DocCoverage[];
  covered: number;
  required: number;
  open_complaints: number;
  open_adverse_events: number;
};

function listDocBasenames(subdir: "qms" | "gvp"): string[] {
  const dir = join(getDocsDir(), "medical-device", subdir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("00-"));
}

function docPresent(docId: string, docNumber: string | undefined, files: string[]): boolean {
  const needles = [docId, docNumber].filter(Boolean).map((s) => s!.toLowerCase());
  return files.some((f) => {
    const base = f.toLowerCase();
    return needles.some((n) => base.startsWith(`${n}-`) || base.includes(n));
  });
}

function isOpenEntry(entry: Record<string, unknown>): boolean {
  const status = String(entry.status ?? entry.state ?? "open").toLowerCase();
  if (
    status === "closed" ||
    status === "resolved" ||
    status === "done" ||
    status === "cancelled" ||
    status === "withdrawn"
  ) {
    return false;
  }
  return true;
}

function loadLedgerEntries(dataFile: string): Record<string, unknown>[] {
  const loaded = loadModuleDataFile(MODULE_ID, dataFile, ledgerFileSchema);
  return loaded?.data.entries ?? [];
}

export function loadQmsCatalog(): MedicalDeviceQmsCatalogFile | null {
  return (
    loadModuleDataFile(MODULE_ID, "qms-catalog.yaml", medicalDeviceQmsCatalogFileSchema)
      ?.data ?? null
  );
}

export function loadGvpCatalog(): MedicalDeviceGvpCatalogFile | null {
  return (
    loadModuleDataFile(MODULE_ID, "gvp-catalog.yaml", medicalDeviceGvpCatalogFileSchema)
      ?.data ?? null
  );
}

export function collectQmsSignals(): QmsSignals {
  const enabled = isMedicalDeviceModuleEnabled();
  if (!enabled) {
    return {
      enabled: false,
      compliance_type_id: "md-qms",
      documents: [],
      missing_required: [],
      covered: 0,
      required: 0,
      document_control_entries: 0,
    };
  }
  const catalog = loadQmsCatalog();
  const files = listDocBasenames("qms");
  const requiredDocs = (catalog?.documents ?? []).filter(
    (d) => d.tier === "1" || d.tier === "2"
  );
  const documents: DocCoverage[] = requiredDocs.map((d) => {
    const present = docPresent(d.id, d.doc_number, files);
    return {
      id: d.id,
      title: d.title,
      tier: d.tier,
      present,
      file_hint: present
        ? files.find((f) => docPresent(d.id, d.doc_number, [f]))
        : undefined,
    };
  });
  const missing_required = documents.filter((d) => !d.present);
  let document_control_entries = 0;
  try {
    const ledgers = loadModuleDataFile(
      MODULE_ID,
      "ledger-registry.yaml",
      medicalDeviceLedgerRegistryFileSchema
    );
    const dc = ledgers?.data.ledgers.find((l) => l.type === "document_control");
    if (dc) document_control_entries = loadLedgerEntries(dc.data_file).length;
  } catch {
    /* */
  }
  return {
    enabled: true,
    compliance_type_id: "md-qms",
    documents,
    missing_required,
    covered: documents.filter((d) => d.present).length,
    required: documents.length,
    document_control_entries,
  };
}

export function collectGvpSignals(): GvpSignals {
  const enabled = isMedicalDeviceModuleEnabled();
  if (!enabled) {
    return {
      enabled: false,
      compliance_type_id: "md-gvp",
      documents: [],
      missing_required: [],
      covered: 0,
      required: 0,
      open_complaints: 0,
      open_adverse_events: 0,
    };
  }
  const catalog = loadGvpCatalog();
  const files = listDocBasenames("gvp");
  // Treat catalog documents that are not FRM-* as required procedures
  const requiredDocs = (catalog?.documents ?? []).filter(
    (d) => !d.id.toUpperCase().includes("FRM")
  );
  const documents: DocCoverage[] = requiredDocs.map((d) => {
    const present = docPresent(d.id, d.doc_number, files);
    return {
      id: d.id,
      title: d.title,
      present,
      file_hint: present
        ? files.find((f) => docPresent(d.id, d.doc_number, [f]))
        : undefined,
    };
  });
  const missing_required = documents.filter((d) => !d.present);

  let open_complaints = 0;
  let open_adverse_events = 0;
  try {
    const ledgers = loadModuleDataFile(
      MODULE_ID,
      "ledger-registry.yaml",
      medicalDeviceLedgerRegistryFileSchema
    );
    for (const l of ledgers?.data.ledgers ?? []) {
      if (l.type === "complaint") {
        open_complaints = loadLedgerEntries(l.data_file).filter(isOpenEntry).length;
      }
      if (l.type === "adverse_event") {
        open_adverse_events = loadLedgerEntries(l.data_file).filter(isOpenEntry)
          .length;
      }
    }
  } catch {
    /* */
  }

  return {
    enabled: true,
    compliance_type_id: "md-gvp",
    documents,
    missing_required,
    covered: documents.filter((d) => d.present).length,
    required: documents.length,
    open_complaints,
    open_adverse_events,
  };
}

/** Optional: ensure catalogs parse (tests). */
export function parseLedgerYamlSafe(absPath: string): number {
  if (!existsSync(absPath)) return 0;
  try {
    const doc = ledgerFileSchema.parse(parseYaml(readFileSync(absPath, "utf-8")));
    return doc.entries.length;
  } catch {
    return 0;
  }
}
