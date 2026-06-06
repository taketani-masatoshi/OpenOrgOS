import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { ZodSchema } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = join(__dirname, "..", "..");
export const CURSOR_DIR = join(ROOT_DIR, "cursor");
export const DATA_DIR = join(CURSOR_DIR, "data");
export const REPORTS_DIR = join(CURSOR_DIR, "reports");

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

export function ensureReportsDir(subdir?: string): string {
  const dir = subdir ? join(REPORTS_DIR, subdir) : REPORTS_DIR;
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeReport(subdir: string, filename: string, content: string): string {
  const dir = ensureReportsDir(subdir);
  const path = join(dir, filename);
  writeFileSync(path, content, "utf-8");
  return path;
}
