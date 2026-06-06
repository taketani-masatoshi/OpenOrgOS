import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { ZodSchema } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = join(__dirname, "..", "..");
export const DOCS_DIR = join(ROOT_DIR, "docs");
export const CURSOR_DIR = join(ROOT_DIR, "cursor");
export const DATA_DIR = join(CURSOR_DIR, "data");
export const SCRATCH_DIR = join(CURSOR_DIR, "scratch");
export const ASSETS_DIR = join(ROOT_DIR, "assets");
export const DOCS_REPORTS_DIR = join(DOCS_DIR, "reports");

/** 受信トレイ — スキャン・申請書・契約原本など（未処理） */
export const DOCS_INBOX_DIR = join(DOCS_DIR, "inbox");

/** 出力トレイ — 印刷・提出用 PDF（処理済み） */
export const DOCS_OUTBOX_DIR = join(DOCS_DIR, "outbox");

/** 法人書類 PDF → outbox/corporate */
export const DOCS_CORPORATE_PDF_DIR = join(DOCS_OUTBOX_DIR, "corporate");

/** 亀沢ゲスト掲示 PDF → outbox/lodging */
export const DOCS_LODGING_PDF_DIR = join(DOCS_OUTBOX_DIR, "lodging");

/** @deprecated use DOCS_CORPORATE_PDF_DIR */
export const OUTPUT_PDF_DIR = DOCS_CORPORATE_PDF_DIR;

/** @deprecated use DOCS_CORPORATE_PDF_DIR */
export const REPORTS_DIR = DOCS_CORPORATE_PDF_DIR;

export function readYamlFile<T>(path: string, schema: ZodSchema<T>): T {
  const raw = readFileSync(path, "utf-8");
  const parsed = YAML.parse(raw);
  return schema.parse(parsed);
}

export function readYamlFileRaw(path: string): unknown {
  const raw = readFileSync(path, "utf-8");
  return YAML.parse(raw);
}

export function writeYamlFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, YAML.stringify(data), "utf-8");
}

export function listYamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => join(dir, f));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function parseMonth(month: string): { year: number; month: number } {
  const [y, m] = month.split("-").map(Number);
  return { year: y, month: m };
}

export function addMonths(month: string, count: number): string {
  const { year, month: m } = parseMonth(month);
  const date = new Date(year, m - 1 + count, 1);
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let current = from;
  while (current <= to) {
    months.push(current);
    current = addMonths(current, 1);
  }
  return months;
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function currentDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function parsePercentChange(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    return parseFloat(trimmed.slice(0, -1)) / 100;
  }
  return parseFloat(trimmed);
}

export function ensurePdfOutputDir(subdir?: string): string {
  const dir = subdir ? join(DOCS_CORPORATE_PDF_DIR, subdir) : DOCS_CORPORATE_PDF_DIR;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** @deprecated use ensurePdfOutputDir */
export function ensureReportsDir(subdir?: string): string {
  return ensurePdfOutputDir(subdir);
}

export function ensureDocsReportsDir(subdir?: string): string {
  const dir = subdir ? join(DOCS_REPORTS_DIR, subdir) : DOCS_REPORTS_DIR;
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** CLI が生成する Markdown レポート（人向け → docs/reports/） */
export function writeMarkdownReport(
  subdir: string,
  filename: string,
  content: string
): string {
  const dir = ensureDocsReportsDir(subdir);
  const path = join(dir, filename);
  writeFileSync(path, content, "utf-8");
  return path;
}

/** @deprecated use writeMarkdownReport for .md; PDF goes to docs/corporate/pdf/ */
export function writeReport(subdir: string, filename: string, content: string): string {
  return writeMarkdownReport(subdir, filename, content);
}
