import YAML from "yaml";
import type {
  IsoRecordColumn,
  IsoRecordRule,
  IsoRecordSeverity,
  IsoRecordSpec,
} from "../../../../schemas/iso-record-spec.js";
import { parseCsv } from "../../csv.js";
import { getClock } from "../../runtime-context.js";
import type { IsoRecordIssue } from "./spec.js";

const PLACEHOLDER = /\{[A-Z][A-Z0-9_]*\}/g;
const SECTION_HEADING = /^#{2,6}\s/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

type Row = Record<string, string>;

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

function checkColumn(
  column: IsoRecordColumn,
  row: Row,
  push: (m: string, s?: IsoRecordSeverity) => void
): void {
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
  push: (m: string, s: IsoRecordSeverity) => void
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
        push(
          `${rule.message}（${rule.left}=${row[rule.left]} · ${rule.right}=${row[rule.right]}）`,
          rule.severity
        );
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

export function yamlListLength(text: string, listKey: string): number {
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

export function evaluateCsv(spec: IsoRecordSpec, text: string, standard: string): IsoRecordIssue[] {
  const issues: IsoRecordIssue[] = [];
  const add = (message: string, severity: IsoRecordSeverity, row?: number): void => {
    issues.push({ standard, file: spec.file, row, severity, message });
  };

  const { header, rows } = parseCsv(text);
  for (const column of spec.columns) {
    if (!header.includes(column.name)) add(`列 ${column.name} がありません`, "error");
  }
  const records: Row[] = rows.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""]))
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
          add(
            `${rule.message}（${rule.columns.join("+")} が ${first} 行目と重複）`,
            rule.severity,
            index + 1
          );
        } else {
          seen.set(key, index + 1);
        }
      }
    }
  }
  return issues;
}

export function evaluateYaml(
  spec: IsoRecordSpec,
  text: string,
  standard: string
): IsoRecordIssue[] {
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
        add(
          `${rule.message}（${found.slice(0, 5).join(" ")}${found.length > 5 ? " ほか" : ""}）`,
          rule.severity
        );
      }
    }
  }
  return issues;
}

export function evaluateMarkdown(
  spec: IsoRecordSpec,
  text: string,
  standard: string
): IsoRecordIssue[] {
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
        add(
          `${rule.message}（${found.slice(0, 5).join(" ")}${found.length > 5 ? " ほか" : ""}）`,
          rule.severity
        );
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
