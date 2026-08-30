import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  isoRecordSpecFileSchema,
  type IsoRecordColumn,
  type IsoRecordRule,
  type IsoRecordSeverity,
  type IsoRecordSpec,
  type IsoRecordSpecFile,
} from "../../schemas/iso-record-spec.js";
import { parseCsv } from "./csv.js";
import { getClock } from "./runtime-context.js";
import { STEWARD_ISO_DIR, STEWARD_STANDARDS_DIR } from "./standards.js";
import { JURISDICTION_PACKS_DIR } from "./steward-paths.js";
import { resolveTenantPath } from "./tenant.js";
import { readYamlFile } from "./utils.js";

export const RECORD_SPEC_FILE = "records.yaml";

export interface IsoRecordIssue {
  standard: string;
  file: string;
  /** 1-based data row, absent for whole-file faults. */
  row?: number;
  severity: IsoRecordSeverity;
  message: string;
}

export interface IsoRecordReport {
  standard: string;
  file: string;
  title: string;
  exists: boolean;
  /** Data rows for a CSV; not meaningful for Markdown. */
  rows: number;
  issues: IsoRecordIssue[];
}

export function recordSpecPath(standard: string): string {
  if (standard === "financial") {
    return join(STEWARD_STANDARDS_DIR, "audit", "financial", RECORD_SPEC_FILE);
  }
  if (standard === "jsox") {
    return join(JURISDICTION_PACKS_DIR, "JP", "modules", "jp_jsox", RECORD_SPEC_FILE);
  }
  return join(STEWARD_ISO_DIR, standard, RECORD_SPEC_FILE);
}

export function loadRecordSpecs(standard: string): IsoRecordSpecFile | undefined {
  const path = recordSpecPath(standard);
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, isoRecordSpecFileSchema);
}

/**
 * Tenant path of the record a spec describes. Kept literal rather than imported
 * from `iso-templates` so the control framework can depend on this module
 * without pulling in the catalog.
 */
export function recordRelPath(standard: string, spec: IsoRecordSpec): string {
  return spec.tenant_path ?? `docs/compliance/iso/${standard}/${spec.file}`;
}

const PLACEHOLDER = /\{[A-Z][A-Z0-9_]*\}/g;
const SECTION_HEADING = /^#{2,6}\s/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function isBlank(value: string | undefined): boolean {
  return (value ?? "").trim() === "";
}

function toNumber(value: string | undefined): number | undefined {
  const text = (value ?? "").trim();
  if (text === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

function daysSince(date: string, now: Date): number {
  return (now.getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000;
}

type Row = Record<string, string>;

function checkColumn(column: IsoRecordColumn, row: Row, push: (m: string, s?: IsoRecordSeverity) => void): void {
  const raw = row[column.name];
  if (isBlank(raw)) {
    if (column.required) push(`${column.name} が空です`);
    return;
  }
  const value = raw.trim();

  if (column.type === "number") {
    const n = toNumber(value);
    if (n === undefined) {
      push(`${column.name} が数値ではありません（"${value}"）`);
      return;
    }
    if (column.min !== undefined && n < column.min) {
      push(`${column.name} が下限 ${column.min} を下回ります（${n}）`);
    }
    if (column.max !== undefined && n > column.max) {
      push(`${column.name} が上限 ${column.max} を超えます（${n}）`);
    }
  }
  if (column.type === "date" && !DATE.test(value)) {
    push(`${column.name} は YYYY-MM-DD 形式で記入してください（"${value}"）`);
  }
  if (column.type === "month" && !MONTH.test(value)) {
    push(`${column.name} は YYYY-MM 形式で記入してください（"${value}"）`);
  }
  if (column.pattern && !new RegExp(column.pattern).test(value)) {
    push(`${column.name} が書式に一致しません（"${value}"）`);
  }
  if (column.values && !column.values.includes(value)) {
    push(`${column.name} は ${column.values.join(" / ")} のいずれかです（"${value}"）`);
  }
}

function compare(left: number, operator: string, right: number): boolean {
  if (operator === "lte") return left <= right;
  if (operator === "lt") return left < right;
  if (operator === "gte") return left >= right;
  return left > right;
}

/** Dates compare lexically; numbers numerically. Mixed or unparsable pairs are skipped. */
function comparableValue(raw: string | undefined): number | undefined {
  const text = (raw ?? "").trim();
  if (text === "") return undefined;
  if (DATE.test(text)) return new Date(`${text}T00:00:00Z`).getTime();
  return toNumber(text);
}

function applyRowRule(
  rule: IsoRecordRule,
  row: Row,
  now: Date,
  push: (m: string, s: IsoRecordSeverity) => void,
): void {
  switch (rule.kind) {
    case "computed": {
      const target = toNumber(row[rule.target]);
      const factors = rule.factors.map((f) => toNumber(row[f]));
      if (target === undefined || factors.some((f) => f === undefined)) return;
      const values = factors as number[];
      const expected =
        rule.operation === "product"
          ? values.reduce((a, b) => a * b, 1)
          : values.reduce((a, b) => a + b, 0);
      if (target !== expected) {
        push(`${rule.message}（${rule.target}=${target} · 期待 ${expected}）`, rule.severity);
      }
      return;
    }
    case "conditional_required": {
      const value = (row[rule.column] ?? "").trim();
      if (!rule.equals.includes(value)) return;
      const missing = rule.require.filter((c) => isBlank(row[c]));
      if (missing.length > 0) {
        push(`${rule.message}（未記入: ${missing.join(", ")}）`, rule.severity);
      }
      return;
    }
    case "comparison": {
      const left = comparableValue(row[rule.left]);
      const right = comparableValue(row[rule.right]);
      if (left === undefined || right === undefined) return;
      if (!compare(left, rule.operator, right)) {
        push(`${rule.message}（${rule.left}=${row[rule.left]} · ${rule.right}=${row[rule.right]}）`, rule.severity);
      }
      return;
    }
    case "freshness": {
      const value = (row[rule.column] ?? "").trim();
      if (!DATE.test(value)) return;
      const age = daysSince(value, now);
      if (age > rule.max_age_days) {
        push(`${rule.message}（${value} · ${Math.floor(age)}日経過）`, rule.severity);
      }
      return;
    }
    default:
      return;
  }
}

function evaluateCsv(spec: IsoRecordSpec, text: string, standard: string): IsoRecordIssue[] {
  const issues: IsoRecordIssue[] = [];
  const add = (message: string, severity: IsoRecordSeverity, row?: number): void => {
    issues.push({ standard, file: spec.file, row, severity, message });
  };

  const { header, rows } = parseCsv(text);
  for (const column of spec.columns) {
    if (!header.includes(column.name)) add(`列 ${column.name} がありません`, "error");
  }
  const records: Row[] = rows.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""])),
  );

  const now = new Date(getClock().nowIso());
  for (const [index, row] of records.entries()) {
    const rowNo = index + 1;
    for (const column of spec.columns) {
      checkColumn(column, row, (m, s) => add(m, s ?? "error", rowNo));
    }
    for (const rule of spec.rules) {
      applyRowRule(rule, row, now, (m, s) => add(m, s, rowNo));
    }
  }

  for (const rule of spec.rules) {
    if (rule.kind === "non_empty" && records.length === 0) {
      add(rule.message, rule.severity);
    }
    if (rule.kind === "unique") {
      const seen = new Map<string, number>();
      for (const [index, row] of records.entries()) {
        const key = rule.columns.map((c) => (row[c] ?? "").trim()).join("\u0000");
        if (key.replaceAll("\u0000", "") === "") continue;
        const first = seen.get(key);
        if (first !== undefined) {
          add(`${rule.message}（${rule.columns.join("+")} が ${first} 行目と重複）`, rule.severity, index + 1);
        } else {
          seen.set(key, index + 1);
        }
      }
    }
  }
  return issues;
}

function yamlListLength(text: string, listKey: string): number {
  const parsed = YAML.parse(text) as unknown;
  if (parsed === null || parsed === undefined) return 0;
  if (Array.isArray(parsed)) return parsed.length;
  if (typeof parsed === "object") {
    const value = (parsed as Record<string, unknown>)[listKey];
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return Object.keys(value).length;
  }
  return 0;
}

function evaluateYaml(spec: IsoRecordSpec, text: string, standard: string): IsoRecordIssue[] {
  const issues: IsoRecordIssue[] = [];
  const add = (message: string, severity: IsoRecordSeverity): void => {
    issues.push({ standard, file: spec.file, severity, message });
  };
  const listKey = spec.list_key ?? "entries";
  let rows = 0;
  try {
    rows = yamlListLength(text, listKey);
  } catch {
    add(`${spec.file} を YAML として読めません。`, "error");
    return issues;
  }
  for (const rule of spec.rules) {
    if (rule.kind === "non_empty" && rows === 0) add(rule.message, rule.severity);
    if (rule.kind === "no_placeholders") {
      const found = [...new Set(text.match(PLACEHOLDER) ?? [])];
      if (found.length > 0) {
        add(`${rule.message}（${found.slice(0, 5).join(" ")}${found.length > 5 ? " ほか" : ""}）`, rule.severity);
      }
    }
  }
  return issues;
}

function evaluateMarkdown(spec: IsoRecordSpec, text: string, standard: string): IsoRecordIssue[] {
  const issues: IsoRecordIssue[] = [];
  const add = (message: string, severity: IsoRecordSeverity): void => {
    issues.push({ standard, file: spec.file, severity, message });
  };
  // Section headings only, so a document whose title happens to contain the
  // wording cannot stand in for the section itself. Numbering ("## 1. 労働条件")
  // is left alone — the operator numbers sections, the spec names them.
  const sections = text.split("\n").filter((line) => SECTION_HEADING.test(line));
  for (const rule of spec.rules) {
    if (rule.kind === "no_placeholders") {
      const found = [...new Set(text.match(PLACEHOLDER) ?? [])];
      if (found.length > 0) {
        add(`${rule.message}（${found.slice(0, 5).join(" ")}${found.length > 5 ? " ほか" : ""}）`, rule.severity);
      }
    }
    if (rule.kind === "required_sections") {
      const missing = rule.headings.filter((h) => !sections.some((line) => line.includes(h)));
      if (missing.length > 0) {
        add(`${rule.message}（不足: ${missing.join(", ")}）`, rule.severity);
      }
    }
  }
  return issues;
}

/**
 * Check one record against its spec. Faults are collected rather than thrown so
 * an operator fixing a register sees every problem in a single pass.
 */
export function checkRecord(standard: string, spec: IsoRecordSpec): IsoRecordReport {
  const rel = recordRelPath(standard, spec);
  const abs = resolveTenantPath(rel);
  const base = { standard, file: spec.file, title: spec.title };
  if (!existsSync(abs)) {
    return {
      ...base,
      exists: false,
      rows: 0,
      issues: [
        {
          standard,
          file: spec.file,
          severity: "error",
          message: `${rel} がありません。orgos iso templates ${standard} --write で配置してください。`,
        },
      ],
    };
  }
  const text = readFileSync(abs, "utf-8");
  let issues: IsoRecordIssue[];
  let rows = 0;
  try {
    issues =
      spec.kind === "csv"
        ? evaluateCsv(spec, text, standard)
        : spec.kind === "yaml"
          ? evaluateYaml(spec, text, standard)
          : evaluateMarkdown(spec, text, standard);
    rows =
      spec.kind === "csv"
        ? parseCsv(text).rows.length
        : spec.kind === "yaml"
          ? yamlListLength(text, spec.list_key ?? "entries")
          : 0;
  } catch (e) {
    issues = [
      {
        standard,
        file: spec.file,
        severity: "error",
        message: e instanceof Error ? e.message : `${spec.file} を検査できません。`,
      },
    ];
  }
  return { ...base, exists: true, rows, issues };
}

export function checkRecordsForStandard(standard: string): IsoRecordReport[] {
  const file = loadRecordSpecs(standard);
  if (!file) return [];
  return file.records.map((spec) => checkRecord(standard, spec));
}

/** Records whose spec is not satisfied, keyed by tenant-relative path. */
export function invalidRecordPaths(standards: string[]): Map<string, IsoRecordIssue[]> {
  const out = new Map<string, IsoRecordIssue[]>();
  for (const standard of standards) {
    const file = loadRecordSpecs(standard);
    if (!file) continue;
    for (const spec of file.records) {
      const report = checkRecord(standard, spec);
      const errors = report.issues.filter((i) => i.severity === "error");
      if (errors.length > 0) out.set(recordRelPath(standard, spec), errors);
    }
  }
  return out;
}

export function formatRecordReports(reports: IsoRecordReport[]): string {
  if (reports.length === 0) return "記録仕様（records.yaml）が定義されていません。";

  const lines = ["# 記録の内容検査", ""];
  const errors = reports.reduce((n, r) => n + r.issues.filter((i) => i.severity === "error").length, 0);
  const warnings = reports.reduce((n, r) => n + r.issues.filter((i) => i.severity === "warning").length, 0);
  lines.push(`**記録:** ${reports.length} 件 · 不備 ${errors} 件 · 警告 ${warnings} 件`, "");

  lines.push("| 記録 | 行数 | 不備 | 警告 |");
  lines.push("|------|------|------|------|");
  for (const r of reports) {
    const e = r.issues.filter((i) => i.severity === "error").length;
    const w = r.issues.filter((i) => i.severity === "warning").length;
    lines.push(`| ${r.file} | ${r.exists ? r.rows : "—"} | ${e} | ${w} |`);
  }

  const withIssues = reports.filter((r) => r.issues.length > 0);
  if (withIssues.length > 0) {
    lines.push("", "## 内容", "");
    for (const r of withIssues) {
      lines.push(`### ${r.file} — ${r.title}`, "");
      for (const issue of r.issues) {
        const mark = issue.severity === "error" ? "✗" : "△";
        const where = issue.row ? `${issue.row}行目: ` : "";
        lines.push(`- ${mark} ${where}${issue.message}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd();
}
