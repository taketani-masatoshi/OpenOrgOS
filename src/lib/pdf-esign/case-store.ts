/**
 * PDF e-sign case ledger (data/pdf-esign/cases.yaml).
 * Path: src/lib/pdf-esign/case-store.ts
 *
 * Only L1 facts are stored: paths, digests, SiVa indication and counts.
 * PDFs, PINs and keys never live in this ledger.
 * Mutations run under an exclusive lock and write via temp + rename.
 */
import { existsSync } from "node:fs";
import {
  pdfEsignCaseSchema,
  pdfEsignCasesFileSchema,
  type PdfEsignCase,
  type PdfEsignCasesFile,
} from "../../../schemas/pdf-esign.js";
import { readYamlFile } from "../utils.js";
import { withYamlFileLock, writeYamlFileAtomic } from "../yaml-atomic.js";
import { getPdfEsignCasesPath } from "./paths.js";

export function loadPdfEsignCases(): PdfEsignCasesFile {
  const path = getPdfEsignCasesPath();
  if (!existsSync(path)) {
    return pdfEsignCasesFileSchema.parse({});
  }
  return readYamlFile(path, pdfEsignCasesFileSchema);
}

export function savePdfEsignCases(file: PdfEsignCasesFile): void {
  writeYamlFileAtomic(getPdfEsignCasesPath(), pdfEsignCasesFileSchema.parse(file));
}

/** Load → mutate → validate → save under the cases.yaml lock. */
function withPdfEsignCasesLock<T>(fn: (file: PdfEsignCasesFile) => T): T {
  return withYamlFileLock(getPdfEsignCasesPath(), () => {
    const file = loadPdfEsignCases();
    const result = fn(file);
    savePdfEsignCases(file);
    return result;
  });
}

export function listPdfEsignCases(): PdfEsignCase[] {
  return loadPdfEsignCases().cases;
}

export function findPdfEsignCase(id: string): PdfEsignCase | undefined {
  return loadPdfEsignCases().cases.find((c) => c.id === id);
}

export function requirePdfEsignCase(id: string): PdfEsignCase {
  const record = findPdfEsignCase(id);
  if (!record) throw new Error(`esign case not found: ${id}`);
  return record;
}

/** `ES-YYYY-NNN` — sequence is per calendar year. */
export function nextPdfEsignCaseId(
  now = new Date(),
  cases: PdfEsignCase[] = listPdfEsignCases(),
): string {
  const year = now.getUTCFullYear();
  const prefix = `ES-${year}-`;
  let max = 0;
  for (const c of cases) {
    if (!c.id.startsWith(prefix)) continue;
    const seq = Number.parseInt(c.id.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function insertPdfEsignCase(input: unknown): PdfEsignCase {
  return withPdfEsignCasesLock((file) => {
    const record = pdfEsignCaseSchema.parse(input);
    if (file.cases.some((c) => c.id === record.id)) {
      throw new Error(`esign case already exists: ${record.id}`);
    }
    file.cases.push(record);
    return record;
  });
}

/** Merge a patch into a case and bump `updated_at`. */
export function updatePdfEsignCase(
  id: string,
  patch: Partial<PdfEsignCase>,
): PdfEsignCase {
  return withPdfEsignCasesLock((file) => {
    const index = file.cases.findIndex((c) => c.id === id);
    if (index < 0) throw new Error(`esign case not found: ${id}`);
    const next = pdfEsignCaseSchema.parse({
      ...file.cases[index],
      ...patch,
      id,
      updated_at: new Date().toISOString(),
    });
    file.cases[index] = next;
    return next;
  });
}
