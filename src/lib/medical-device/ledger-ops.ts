/**
 * Medical-device ledger load/save and typed entry helpers.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import {
  medicalDeviceAdverseEventEntrySchema,
  medicalDeviceAuthorityInquiryEntrySchema,
  medicalDeviceCapaEntrySchema,
  medicalDeviceChangeControlEntrySchema,
  medicalDeviceComplaintEntrySchema,
  medicalDeviceDocumentControlEntrySchema,
  medicalDeviceLedgerFileSchema,
  medicalDeviceLedgerFileSchemaFor,
  medicalDeviceLedgerRegistryFileSchema,
  medicalDevicePmsEntrySchema,
  medicalDeviceTrainingEntrySchema,
  type MedicalDeviceLedgerType,
} from "../../../schemas/jp-medical-device.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
  resolveModuleDataFile,
} from "../module-business-data.js";
import { currentDate, writeYamlFile } from "../utils.js";
import { appendMedicalDeviceAudit } from "./audit.js";
import { gvpReportDueOn } from "./gvp-due.js";
import {
  assertCapaEntryCloseable,
  assertInquiryEntryCloseable,
} from "./close-gates.js";

export const MODULE_ID = "jp_medical_device";

const CLOSED = new Set(["closed", "resolved", "done", "cancelled", "withdrawn", "obsolete"]);

export function isOpenLedgerEntry(entry: Record<string, unknown>): boolean {
  const status = String(entry.status ?? entry.state ?? "open").toLowerCase();
  return !CLOSED.has(status);
}

export function loadLedgerRegistry() {
  return loadModuleDataFile(MODULE_ID, "ledger-registry.yaml", medicalDeviceLedgerRegistryFileSchema);
}

export function findLedgerByType(type: MedicalDeviceLedgerType) {
  const reg = loadLedgerRegistry();
  return reg?.data.ledgers.find((l) => l.type === type) ?? null;
}

export function findLedgerById(id: string) {
  const reg = loadLedgerRegistry();
  return reg?.data.ledgers.find((l) => l.id === id) ?? null;
}

export function loadLedgerEntries(dataFile: string): Record<string, unknown>[] {
  const loaded = loadModuleDataFile(MODULE_ID, dataFile, medicalDeviceLedgerFileSchema);
  return (loaded?.data.entries ?? []) as Record<string, unknown>[];
}

export function saveLedgerFile(
  dataFile: string,
  entries: Record<string, unknown>[],
  version: string | number = "1"
): string {
  const abs = resolveModuleDataFile(MODULE_ID, dataFile);
  mkdirSync(dirname(abs), { recursive: true });
  writeYamlFile(abs, { version: String(version), entries });
  return abs;
}

function nextId(prefix: string, entries: Record<string, unknown>[]): string {
  const today = currentDate().replace(/-/g, "");
  let max = 0;
  const re = new RegExp(`^${prefix}-${today}-(\\d+)$`);
  for (const e of entries) {
    const id = String(e.id ?? "");
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${today}-${String(max + 1).padStart(3, "0")}`;
}

export type LedgerAddInput = {
  type: MedicalDeviceLedgerType;
  fields: Record<string, unknown>;
  actor?: string;
};

export function addLedgerEntry(input: LedgerAddInput): {
  entry: Record<string, unknown>;
  path: string;
  ledgerId: string;
} {
  const ledger = findLedgerByType(input.type);
  if (!ledger) {
    throw new Error(`ledger type not registered: ${input.type}`);
  }
  const existing = loadLedgerEntries(ledger.data_file);
  const prefixMap: Partial<Record<MedicalDeviceLedgerType, string>> = {
    complaint: "CMP",
    adverse_event: "AE",
    training: "TRN",
    document_control: "DOC",
    change_control: "CHG",
    capa: "CAPA",
    pms: "PMS",
    authority_inquiry: "INQ",
    distribution: "DST",
    manufacturing_batch: "BAT",
    maintenance: "MNT",
  };
  const prefix = prefixMap[input.type] ?? "MD";
  const id =
    typeof input.fields.id === "string" && input.fields.id.trim()
      ? String(input.fields.id)
      : nextId(prefix, existing);

  let raw: Record<string, unknown> = { ...input.fields, id };
  if (input.type === "adverse_event") {
    const seriousness = String(raw.seriousness ?? "other") as "death" | "serious" | "other";
    const received = String(raw.received_on ?? currentDate());
    raw = {
      ...raw,
      received_on: received,
      seriousness,
      reportable: raw.reportable ?? true,
      gvp_due_on: raw.gvp_due_on ?? gvpReportDueOn(received, seriousness),
      status: raw.status ?? "open",
    };
  }
  if (input.type === "complaint") {
    raw = {
      ...raw,
      received_on: raw.received_on ?? currentDate(),
      status: raw.status ?? "open",
    };
  }
  if (input.type === "training") {
    raw = {
      ...raw,
      held_on: raw.held_on ?? currentDate(),
      status: raw.status ?? "closed",
      attendee_refs: raw.attendee_refs ?? [],
    };
  }
  if (input.type === "document_control") {
    raw = {
      ...raw,
      status: raw.status ?? "draft",
      version: raw.version ?? "0.1",
    };
  }
  if (input.type === "change_control") {
    raw = {
      ...raw,
      opened_on: raw.opened_on ?? currentDate(),
      status: raw.status ?? "open",
    };
  }
  if (input.type === "capa") {
    raw = {
      ...raw,
      opened_on: raw.opened_on ?? currentDate(),
      status: raw.status ?? "open",
    };
  }
  if (input.type === "pms") {
    raw = {
      ...raw,
      opened_on: raw.opened_on ?? currentDate(),
      status: raw.status ?? "open",
      data_sources: raw.data_sources ?? [],
    };
  }
  if (input.type === "authority_inquiry") {
    raw = {
      ...raw,
      received_on: raw.received_on ?? currentDate(),
      status: raw.status ?? "open",
    };
  }
  if (input.type === "distribution") {
    raw = {
      ...raw,
      shipped_on: raw.shipped_on ?? currentDate(),
      status: raw.status ?? "closed",
    };
  }
  if (input.type === "manufacturing_batch") {
    raw = {
      ...raw,
      manufactured_on: raw.manufactured_on ?? currentDate(),
      status: raw.status ?? "closed",
    };
  }

  const schema = medicalDeviceLedgerFileSchemaFor(input.type);
  const parsedFile = schema.parse({ version: "1", entries: [...existing, raw] });
  const entry = parsedFile.entries[parsedFile.entries.length - 1] as Record<string, unknown>;
  const path = saveLedgerFile(ledger.data_file, parsedFile.entries as Record<string, unknown>[]);
  appendMedicalDeviceAudit({
    actor: input.actor,
    op: "ledger.add",
    entity_type: input.type,
    entity_id: String(entry.id),
    summary: `Added ${input.type} ${entry.id}`,
    detail: { ledger_id: ledger.id },
  });

  if (input.type === "capa") {
    linkCapaToSource({
      capaId: String(entry.id),
      source: String(entry.source ?? ""),
      sourceRef: entry.source_ref ? String(entry.source_ref) : undefined,
      actor: input.actor,
    });
  }

  return { entry, path, ledgerId: ledger.id };
}

/** Back-link CAPA id onto complaint / adverse_event source rows. */
export function linkCapaToSource(opts: {
  capaId: string;
  source: string;
  sourceRef?: string;
  actor?: string;
}): void {
  if (!opts.sourceRef) return;
  const type: MedicalDeviceLedgerType | null =
    opts.source === "complaint"
      ? "complaint"
      : opts.source === "ae"
        ? "adverse_event"
        : null;
  if (!type) return;
  try {
    updateLedgerEntry({
      type,
      id: opts.sourceRef,
      patch: { capa_id: opts.capaId },
      actor: opts.actor,
      op: "capa.link_source",
    });
  } catch {
    /* source may be missing — CAPA still created */
  }
}

export function closeLedgerEntry(opts: {
  type: MedicalDeviceLedgerType;
  id: string;
  actor?: string;
  status?: string;
  force?: boolean;
  /** Skip capa/inquiry gates (internal only — prefer force). */
  skipGates?: boolean;
}): { entry: Record<string, unknown>; path: string } {
  const ledger = findLedgerByType(opts.type);
  if (!ledger) throw new Error(`ledger type not registered: ${opts.type}`);
  const entries = loadLedgerEntries(ledger.data_file);
  const idx = entries.findIndex((e) => String(e.id) === opts.id);
  if (idx < 0) throw new Error(`entry not found: ${opts.id}`);
  const current = entries[idx];
  if (!opts.skipGates) {
    if (opts.type === "capa") {
      assertCapaEntryCloseable(current, { force: opts.force });
    }
    if (opts.type === "authority_inquiry") {
      assertInquiryEntryCloseable(current, { force: opts.force });
    }
  }
  const next = {
    ...current,
    status: opts.status ?? "closed",
    ...(opts.type === "authority_inquiry" && !current.responded_on
      ? { responded_on: currentDate() }
      : {}),
  };
  entries[idx] = next;
  const path = saveLedgerFile(ledger.data_file, entries);
  appendMedicalDeviceAudit({
    actor: opts.actor,
    op: "ledger.close",
    entity_type: opts.type,
    entity_id: opts.id,
    summary: `Closed ${opts.type} ${opts.id}`,
  });
  return { entry: next, path };
}

export function updateLedgerEntry(opts: {
  type: MedicalDeviceLedgerType;
  id: string;
  patch: Record<string, unknown>;
  actor?: string;
  op?: string;
}): { entry: Record<string, unknown>; path: string } {
  const ledger = findLedgerByType(opts.type);
  if (!ledger) throw new Error(`ledger type not registered: ${opts.type}`);
  const entries = loadLedgerEntries(ledger.data_file);
  const idx = entries.findIndex((e) => String(e.id) === opts.id);
  if (idx < 0) throw new Error(`entry not found: ${opts.id}`);
  const next: Record<string, unknown> = { ...entries[idx], id: opts.id };
  for (const [k, v] of Object.entries(opts.patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  entries[idx] = next;
  const path = saveLedgerFile(ledger.data_file, entries);
  appendMedicalDeviceAudit({
    actor: opts.actor,
    op: opts.op ?? "ledger.update",
    entity_type: opts.type,
    entity_id: opts.id,
    summary: `Updated ${opts.type} ${opts.id}`,
    detail: { keys: Object.keys(opts.patch) },
  });
  return { entry: next, path };
}

export function ensureDataDir(): string {
  const dir = getModuleDataDir(MODULE_ID);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function parseJsonFields(raw?: string): Record<string, unknown> {
  if (!raw?.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  return z.record(z.unknown()).parse(parsed);
}

export function recordDocumentControlRevision(opts: {
  docId: string;
  title?: string;
  path?: string;
  version?: string;
  actor?: string;
}): Record<string, unknown> {
  const ledger = findLedgerByType("document_control");
  if (!ledger) {
    return {};
  }
  const existing = loadLedgerEntries(ledger.data_file);
  const sameDoc = existing.filter((e) => String(e.doc_id) === opts.docId);
  let nextVersion = opts.version;
  if (!nextVersion) {
    const versions = sameDoc
      .map((e) => String(e.version ?? "0"))
      .map((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      });
    const max = versions.length ? Math.max(...versions) : 0;
    nextVersion = String(Math.floor(max) + 1);
  }
  const latest = sameDoc[sameDoc.length - 1];
  if (latest && String(latest.status) === "approved") {
    updateLedgerEntry({
      type: "document_control",
      id: String(latest.id),
      patch: { status: "obsolete" },
      actor: opts.actor,
      op: "document.obsolete",
    });
  }
  const { entry } = addLedgerEntry({
    type: "document_control",
    actor: opts.actor,
    fields: {
      doc_id: opts.docId,
      title: opts.title,
      version: nextVersion,
      status: "draft",
      path: opts.path,
      supersedes: latest ? String(latest.id) : undefined,
    },
  });
  return entry;
}

/** Re-export typed parsers for CLI validation of JSON fields. */
export const typedEntrySchemas = {
  complaint: medicalDeviceComplaintEntrySchema,
  adverse_event: medicalDeviceAdverseEventEntrySchema,
  training: medicalDeviceTrainingEntrySchema,
  document_control: medicalDeviceDocumentControlEntrySchema,
  change_control: medicalDeviceChangeControlEntrySchema,
  capa: medicalDeviceCapaEntrySchema,
  pms: medicalDevicePmsEntrySchema,
  authority_inquiry: medicalDeviceAuthorityInquiryEntrySchema,
};
