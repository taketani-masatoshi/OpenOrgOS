import { createHash } from "node:crypto";
import type { IngestDirection, IngestSourceKind } from "../../../../../schemas/finance/ingest.js";
import type { TaxCategory } from "../../../../../schemas/finance/journal-entry.js";

export type AdapterNormalizedRow = {
  occurred_on: string;
  direction: IngestDirection;
  amount_yen: number;
  payee: string;
  description: string;
  category_hint?: string;
  tax_category?: TaxCategory;
  raw?: Record<string, string>;
};

export type AdapterParseResult = {
  source_kind: IngestSourceKind;
  rows: AdapterNormalizedRow[];
  notes: string[];
};

export function assertNotPdf(pathOrName: string): void {
  if (/\.pdf$/i.test(pathOrName)) {
    throw new Error(
      `PDF は取込対象外です（${pathOrName}）。CSV / MD / TXT に変換してから投入してください（pdftotext や各サービスの CSV ダウンロード）。`,
    );
  }
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeText(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function rowFingerprint(input: {
  source_kind: string;
  occurred_on: string;
  direction: string;
  amount_yen: number;
  payee: string;
  description: string;
  /** Optional bank/reference disambiguation (not file path). */
  reference?: string;
}): string {
  return sha256Hex(
    [
      input.source_kind,
      input.occurred_on,
      input.direction,
      String(input.amount_yen),
      normalizeText(input.payee).toLowerCase(),
      normalizeText(input.description).toLowerCase(),
      normalizeText(input.reference).toLowerCase(),
    ].join("|"),
  );
}

export function fileFingerprint(content: string | Buffer): string {
  return sha256Hex(content);
}

export function normalizeDirection(
  value: string,
  fallback: IngestDirection = "outflow",
): IngestDirection {
  const n = value.trim().toLowerCase();
  if (!n) return fallback;
  if (["inflow", "in", "deposit", "入金", "受取", "チャージ"].includes(n)) return "inflow";
  if (["outflow", "out", "withdrawal", "出金", "支払", "支払い"].includes(n)) return "outflow";
  if (n.startsWith("-") || n.includes("出")) return "outflow";
  if (n.includes("入")) return "inflow";
  return fallback;
}

export function normalizeDate(raw: string): string {
  const t = raw.trim().replace(/\//g, "-");
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) throw new Error(`invalid date: ${raw}`);
  return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
}
