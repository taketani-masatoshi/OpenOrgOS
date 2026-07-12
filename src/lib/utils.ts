import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import YAML from "yaml";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { sanitizeForTrackedOutput } from "./sanitize-output.js";
import {
  ROOT_DIR,
  FRAMEWORK_DOCS_DIR,
  getTenantDir,
  resolveTenantPath,
  toLogicalPath,
} from "./tenant.js";
import { getClock } from "./runtime-context.js";

export { ROOT_DIR, FRAMEWORK_DOCS_DIR, resolveTenantPath, toLogicalPath, getTenantDir };
export { getTenantId, setTenantId, loadTenantConfig, listTenantIds } from "./tenant.js";

/** Active tenant human/docs zone (lazy — safe after setTenantId). */
export function getDocsDir(): string {
  return join(getTenantDir(), "docs");
}

/** Active tenant source-of-truth YAML (lazy). */
export function getDataDir(): string {
  return join(getTenantDir(), "data");
}

export const SCRATCH_DIR = join(ROOT_DIR, "scratch");

export function getExecutiveDir(): string {
  return join(getDataDir(), "executive");
}

export function getStakeholdersYaml(): string {
  return join(getExecutiveDir(), "stakeholders.yaml");
}

export function getStakeholdersDocsDir(): string {
  return join(getDocsDir(), "executive", "stakeholders");
}

export function getBankAccountsYaml(): string {
  return join(getDataDir(), "finance", "bank-accounts.yaml");
}

export function getClassificationRegistryYaml(): string {
  return join(getDataDir(), "classification-registry.yaml");
}

export function getDocsReportsDir(): string {
  return join(getDocsDir(), "reports");
}

export function getDocsInboxDir(): string {
  return join(getDocsDir(), "io", "inbox");
}

export function getDocsOutboxDir(): string {
  return join(getDocsDir(), "io", "outbox");
}

export function getDocsCorporatePdfDir(): string {
  return join(getDocsOutboxDir(), "corporate");
}

export function getDocsLodgingPdfDir(): string {
  return join(getDocsOutboxDir(), "lodging");
}

export const ASSETS_DIR = join(ROOT_DIR, "assets");

export function readYamlFile<S extends ZodTypeAny>(path: string, schema: S): z.output<S> {
  const raw = readFileSync(path, "utf-8");
  const parsed = YAML.parse(raw);
  return schema.parse(parsed);
}

export function readYamlFileRaw(path: string): unknown {
  const raw = readFileSync(path, "utf-8");
  return YAML.parse(raw);
}

/**
 * Load a framework registry YAML, falling back to `fallback()` when the file is
 * absent. Shared by routing / webhook / cloud-agent / skill registries.
 */
export function loadRegistryFile<S extends ZodTypeAny>(
  path: string,
  schema: S,
  fallback: () => z.output<S>
): z.output<S> {
  if (!existsSync(path)) return fallback();
  return readYamlFile(path, schema);
}

/** Format an ISO date (YYYY-MM-DD) as Japanese `YYYY年M月D日`. */
export function formatJapaneseDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}年${m}月${d}日`;
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
  const now = getClock().now();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function currentDate(): string {
  const now = getClock().now();
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
  const dir = subdir ? join(getDocsCorporatePdfDir(), subdir) : getDocsCorporatePdfDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureDocsReportsDir(subdir?: string): string {
  const dir = subdir ? join(getDocsReportsDir(), subdir) : getDocsReportsDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Single entry point for writing a git-tracked file. Applies L2 → tracked-output
 * sanitization so secret values never reach a tracked file. All tracked MD/text
 * writers should route through this rather than calling writeFileSync directly.
 */
export function writeTrackedFile(path: string, content: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, sanitizeForTrackedOutput(content), "utf-8");
  return path;
}

/** CLI が生成する Markdown レポート（人向け → docs/reports/ · L1 サニタイズ） */
export function writeMarkdownReport(subdir: string, filename: string, content: string): string {
  return writeTrackedFile(join(ensureDocsReportsDir(subdir), filename), content);
}
