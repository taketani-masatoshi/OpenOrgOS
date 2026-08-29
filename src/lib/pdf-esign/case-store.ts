/**
 * PDF e-sign case ledger (data/pdf-esign/cases.yaml).
 * Path: src/lib/pdf-esign/case-store.ts
 *
 * Only L1 facts are stored: paths, digests, SiVa indication and counts.
 * PDFs, PINs and keys never live in this ledger.
 */
import { existsSync } from "node:fs";
import {
  pdfEsignCaseSchema,
  pdfEsignCasesFileSchema,
  type PdfEsignCase,
  type PdfEsignCasesFile,
} from "../../../schemas/pdf-esign.js";
import { readYamlFile, writeYamlFile } from "../utils.js";
import { getPdfEsignCasesPath } from "./paths.js";

export function loadPdfEsignCases(): PdfEsignCasesFile {
  const path = getPdfEsignCasesPath();
  if (!existsSync(path)) {
    return pdfEsignCasesFileSchema.parse({});
  }
  return readYamlFile(path, pdfEsignCasesFileSchema);
}

export function savePdfEsignCases(file: PdfEsignCasesFile): void {
  writeYamlFile(getPdfEsignCasesPath(), pdfEsignCasesFileSchema.parse(file));
}

export function listPdfEsignCases(): PdfEsignCase[] {
  return loadPdfEsignCases().cases;
}

export function findPdfEsignCase(id: string): PdfEsignCase | undefined {
  return loadPdfEsignCases().cases.find((c) => c.id === id);
}

/** `ES-YYYY-NNN` — sequence is per calendar year. */
export function nextPdfEsignCaseId(now = new Date()): string {
  const year = now.getUTCFullYear();
  const prefix = `ES-${year}-`;
  let max = 0;
  for (const c of listPdfEsignCases()) {
    if (!c.id.startsWith(prefix)) continue;
    const seq = Number.parseInt(c.id.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function insertPdfEsignCase(input: unknown): PdfEsignCase {
  const record = pdfEsignCaseSchema.parse(input);
  const file = loadPdfEsignCases();
  if (file.cases.some((c) => c.id === record.id)) {
    throw new Error(`esign case already exists: ${record.id}`);
  }
  file.cases.push(record);
  savePdfEsignCases(file);
  return record;
}

/** Merge a patch into a case and bump `updated_at`. */
export function updatePdfEsignCase(
  id: string,
  patch: Partial<PdfEsignCase>,
): PdfEsignCase {
  const file = loadPdfEsignCases();
  const index = file.cases.findIndex((c) => c.id === id);
  if (index < 0) throw new Error(`esign case not found: ${id}`);
  const next = pdfEsignCaseSchema.parse({
    ...file.cases[index],
    ...patch,
    id,
    updated_at: new Date().toISOString(),
  });
  file.cases[index] = next;
  savePdfEsignCases(file);
  return next;
}
