#!/usr/bin/env node
/**
 * Conformity drill — does the audit find what it is supposed to find?
 *
 * A throwaway tenant is filled with two kinds of dummy record: one that should
 * pass, and one deliberately broken per rule so the expected finding is known
 * in advance. Green output means the engine agreed with the expectation, not
 * that any real tenant conforms.
 *
 * Stage 1 checks the record layer rule by rule.
 * Stage 2 drives `iso audit run` so a record fault shows up as an audit finding
 * with the gap type it deserves.
 *
 *   node --import tsx scripts/iso-conformity-drill.ts [--tenant iso-drill] [--keep]
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listEffectiveControls, loadControlMaps } from "../src/lib/control-framework.js";
import { listAvailableIsoIds } from "../src/lib/iso-catalog.js";
import { evaluateIsoInternalAudit } from "../src/lib/iso-internal-audit.js";
import {
  checkRecord,
  loadRecordSpecs,
  recordRelPath,
  type IsoRecordIssue,
} from "../src/lib/iso-records.js";
import { loadRegulationsCatalog } from "../src/lib/regulations.js";
import { getTenantsDir, resolveTenantPath, setTenantId } from "../src/lib/tenant.js";
import type {
  IsoRecordColumn,
  IsoRecordRule,
  IsoRecordSeverity,
  IsoRecordSpec,
} from "../schemas/iso-record-spec.js";

const args = process.argv.slice(2);
const tenantId = args.includes("--tenant") ? args[args.indexOf("--tenant") + 1]! : "iso-drill";
const keep = args.includes("--keep");

const TODAY = new Date();

function isoDate(offsetDays = 0): string {
  return new Date(TODAY.getTime() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function isoMonth(offsetMonths = 0): string {
  return new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - offsetMonths, 1))
    .toISOString()
    .slice(0, 7);
}

// ---------------------------------------------------------------- generation

function fromPattern(pattern: string, index: number): string {
  const body = pattern.replace(/^\^/, "").replace(/\$$/, "");
  const candidate = body.replace(/\[0-9\]\{(\d+)\}/g, (_m, width: string) =>
    String(index).padStart(Number(width), "0"),
  );
  return new RegExp(pattern).test(candidate) ? candidate : `DUMMY-${index}`;
}

function looksLikeDate(name: string): boolean {
  return /(_on|_date|^due$|^date$)/.test(name);
}

/** Columns a rule needs even when the spec does not declare them. */
function ruleColumns(rules: IsoRecordRule[]): string[] {
  const names: string[] = [];
  for (const rule of rules) {
    if (rule.kind === "conditional_required") names.push(rule.column, ...rule.require);
    if (rule.kind === "comparison") names.push(rule.left, rule.right);
    if (rule.kind === "computed") names.push(rule.target, ...rule.factors);
    if (rule.kind === "freshness") names.push(rule.column);
    if (rule.kind === "unique") names.push(...rule.columns);
  }
  return names;
}

function numberFor(column: IsoRecordColumn | undefined, name: string): number {
  if (/difference|variance|gap/.test(name)) return 0;
  const min = column?.min ?? 1;
  const max = column?.max ?? Number.POSITIVE_INFINITY;
  return Math.min(Math.max(1, min), max);
}

function baseValue(name: string, column: IsoRecordColumn | undefined, index: number): string {
  if (column?.values && column.values.length > 0) return column.values[0]!;
  if (column?.pattern) return fromPattern(column.pattern, index);
  if (column?.type === "number") return String(numberFor(column, name));
  if (column?.type === "date") return isoDate(index);
  if (column?.type === "month") return isoMonth(index - 1);
  if (looksLikeDate(name)) return isoDate(index);
  if (name === "id") return `DUMMY-${String(index).padStart(3, "0")}`;
  return `ダミー${index}`;
}

/** Settle comparisons and totals so a row is consistent, not merely well typed. */
function reconcile(row: Record<string, string>, spec: IsoRecordSpec): void {
  const byName = new Map(spec.columns.map((c) => [c.name, c]));

  for (const rule of spec.rules) {
    if (rule.kind !== "comparison") continue;
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(row[rule.left] ?? row[rule.right] ?? "");
    const ascending = rule.operator === "lte" || rule.operator === "lt";
    const strict = rule.operator === "lt" || rule.operator === "gt";
    if (isDate) {
      const early = isoDate(1);
      const late = isoDate(0);
      row[rule.left] = strict ? (ascending ? early : late) : early;
      row[rule.right] = strict ? (ascending ? late : early) : early;
      continue;
    }
    const lo = numberFor(byName.get(rule.left), rule.left);
    const hi = numberFor(byName.get(rule.right), rule.right);
    if (!strict) {
      const value = String(Math.max(lo, hi));
      row[rule.left] = value;
      row[rule.right] = value;
    } else if (ascending) {
      row[rule.left] = String(lo);
      row[rule.right] = String(lo + 1);
    } else {
      row[rule.left] = String(lo + 1);
      row[rule.right] = String(lo);
    }
  }

  for (const rule of spec.rules) {
    if (rule.kind !== "computed") continue;
    const factors = rule.factors.map((f) => Number(row[f] ?? "1"));
    row[rule.target] = String(
      rule.operation === "product"
        ? factors.reduce((a, b) => a * b, 1)
        : factors.reduce((a, b) => a + b, 0),
    );
  }
}

function columnNames(spec: IsoRecordSpec): string[] {
  const names = spec.columns.map((c) => c.name);
  for (const extra of ruleColumns(spec.rules)) {
    if (!names.includes(extra)) names.push(extra);
  }
  return names;
}

function buildRows(spec: IsoRecordSpec, count = 2): Record<string, string>[] {
  const names = columnNames(spec);
  const byName = new Map(spec.columns.map((c) => [c.name, c]));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i <= count; i += 1) {
    const row: Record<string, string> = {};
    for (const name of names) row[name] = baseValue(name, byName.get(name), i);
    reconcile(row, spec);
    rows.push(row);
  }
  return rows;
}

function serializeCsv(spec: IsoRecordSpec, rows: Record<string, string>[]): string {
  const names = columnNames(spec);
  return [names.join(","), ...rows.map((r) => names.map((n) => r[n] ?? "").join(","))].join("\n") + "\n";
}

function markdownBody(spec: IsoRecordSpec, headings?: string[]): string {
  const required =
    headings ?? spec.rules.flatMap((r) => (r.kind === "required_sections" ? r.headings : []));
  const lines = [`# ${spec.title}`, "", `記入日: ${isoDate()} — ドリル用ダミー`, ""];
  for (const heading of required) {
    lines.push(`## ${heading}`, "", "ドリル用の記載。実運用の記録ではない。", "");
  }
  if (required.length === 0) lines.push("ドリル用の記載。実運用の記録ではない。", "");
  return lines.join("\n");
}

function yamlBody(spec: IsoRecordSpec, entries = 1): string {
  const key = spec.list_key ?? "entries";
  const lines = ['version: "1"', `${key}:`];
  for (let i = 1; i <= entries; i += 1) {
    lines.push(
      `  - id: DUMMY-${String(i).padStart(3, "0")}`,
      `    title: ドリル用ダミー（${spec.title}）`,
      `    recorded_on: ${isoDate()}`,
    );
  }
  if (entries === 0) lines[1] = `${key}: []`;
  return `${lines.join("\n")}\n`;
}

function conformingBody(spec: IsoRecordSpec): string {
  if (spec.kind === "csv") return serializeCsv(spec, buildRows(spec));
  if (spec.kind === "yaml") return yamlBody(spec);
  return markdownBody(spec);
}

function write(standard: string, spec: IsoRecordSpec, body: string): void {
  const abs = resolveTenantPath(recordRelPath(standard, spec));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, "utf-8");
}

// --------------------------------------------------------------- stage 1

interface Case {
  standard: string;
  file: string;
  label: string;
  body: string;
  /** What the drill asserts the checker will say. */
  expect: "conform" | IsoRecordSeverity;
  /** Substring the reported issue must carry, so the right rule fired. */
  contains?: string;
}

function ruleCases(standard: string, spec: IsoRecordSpec): Case[] {
  const cases: Case[] = [];
  const file = spec.file;
  const add = (label: string, body: string, rule: IsoRecordRule, contains?: string): void => {
    cases.push({
      standard,
      file,
      label,
      body,
      expect: rule.severity,
      contains: contains ?? rule.message.slice(0, 12),
    });
  };

  for (const rule of spec.rules) {
    if (spec.kind === "csv") {
      switch (rule.kind) {
        case "non_empty":
          add("空の台帳", serializeCsv(spec, []), rule);
          break;
        case "unique": {
          const rows = buildRows(spec);
          for (const col of rule.columns) rows[1]![col] = rows[0]![col]!;
          add(`${rule.columns.join("+")} 重複`, serializeCsv(spec, rows), rule);
          break;
        }
        case "computed": {
          const rows = buildRows(spec);
          rows[0]![rule.target] = String(Number(rows[0]![rule.target] ?? "0") + 1);
          add(`${rule.target} が計算と不一致`, serializeCsv(spec, rows), rule);
          break;
        }
        case "conditional_required": {
          const rows = buildRows(spec);
          rows[0]![rule.column] = rule.equals[0]!;
          for (const col of rule.require) rows[0]![col] = "";
          add(`${rule.column}=${rule.equals[0]} で従属列が空`, serializeCsv(spec, rows), rule);
          break;
        }
        case "comparison": {
          const rows = buildRows(spec);
          const left = rows[0]![rule.left] ?? "";
          const ascending = rule.operator === "lte" || rule.operator === "lt";
          if (/^\d{4}-\d{2}-\d{2}$/.test(left)) {
            rows[0]![rule.left] = ascending ? isoDate(0) : isoDate(2);
            rows[0]![rule.right] = ascending ? isoDate(2) : isoDate(0);
          } else {
            const base = Number(left || "1");
            rows[0]![rule.left] = String(ascending ? base + 5 : base);
            rows[0]![rule.right] = String(ascending ? base : base + 5);
          }
          add(`${rule.left} と ${rule.right} の大小が逆`, serializeCsv(spec, rows), rule);
          break;
        }
        case "freshness": {
          const rows = buildRows(spec);
          rows[0]![rule.column] = isoDate(rule.max_age_days + 30);
          add(`${rule.column} が陳腐化`, serializeCsv(spec, rows), rule);
          break;
        }
        default:
          break;
      }
      continue;
    }

    if (spec.kind === "markdown") {
      if (rule.kind === "no_placeholders") {
        add("プレースホルダ未置換", `${markdownBody(spec)}\n担当: {OWNER}\n`, rule);
      }
      if (rule.kind === "required_sections") {
        add(
          `節 ${rule.headings[0]} が欠落`,
          markdownBody(spec, rule.headings.slice(1)),
          rule,
        );
      }
      continue;
    }

    if (rule.kind === "non_empty") add("空のリスト", yamlBody(spec, 0), rule);
    if (rule.kind === "no_placeholders") {
      add("プレースホルダ未置換", `${yamlBody(spec)}    owner: "{OWNER}"\n`, rule);
    }
  }

  // Column-level faults are not rules but must still be caught.
  if (spec.kind === "csv") {
    const required = spec.columns.find((c) => c.required);
    if (required) {
      const rows = buildRows(spec);
      rows[0]![required.name] = "";
      cases.push({
        standard,
        file,
        label: `必須列 ${required.name} が空`,
        body: serializeCsv(spec, rows),
        expect: "error",
        contains: `${required.name} が空です`,
      });
    }
    const typed = spec.columns.find((c) => c.type !== "text" || c.pattern || c.values);
    if (typed) {
      const rows = buildRows(spec);
      rows[0]![typed.name] = "ぐちゃぐちゃ";
      cases.push({
        standard,
        file,
        label: `${typed.name} が型・書式違反`,
        body: serializeCsv(spec, rows),
        expect: "error",
        contains: typed.name,
      });
    }
  }

  return cases;
}

function matches(issues: IsoRecordIssue[], c: Case): boolean {
  if (c.expect === "conform") return issues.every((i) => i.severity !== "error");
  return issues.some(
    (i) => i.severity === c.expect && (!c.contains || i.message.includes(c.contains)),
  );
}

// ---------------------------------------------------------------- tenant

const STANDARDS = [...listAvailableIsoIds(), "financial", "jsox"];
const tenantDir = join(getTenantsDir(), tenantId);

rmSync(tenantDir, { recursive: true, force: true });
mkdirSync(tenantDir, { recursive: true });
writeFileSync(
  join(tenantDir, "tenant.yaml"),
  [
    `id: ${tenantId}`,
    "name: ISO 適合ドリル",
    "description: 監査が意図どおり適合・不適合を出すかの確認用。ダミーであり証拠ではない。",
    "lifecycle: test",
    "operation_mode: development",
    "jurisdiction: JP",
    "",
  ].join("\n"),
  "utf-8",
);
writeFileSync(
  join(tenantDir, "standards.yaml"),
  ["iso:", ...listAvailableIsoIds().map((id) => `  - id: ${id}\n    enabled: true`), ""].join("\n"),
  "utf-8",
);
writeFileSync(
  join(tenantDir, "modules.yaml"),
  ["modules:", "  - id: jp_jsox", "    enabled: true", "    agent: jp_jsox", ""].join("\n"),
  "utf-8",
);

setTenantId(tenantId);

writeFileSync(
  join(tenantDir, "regulations.yaml"),
  [
    "regulations:",
    ...loadRegulationsCatalog().regulations.map((r) => `  - id: ${r.id}\n    enabled: true`),
    "",
  ].join("\n"),
  "utf-8",
);

function writeConformingRecords(): void {
  for (const standard of STANDARDS) {
    for (const spec of loadRecordSpecs(standard)?.records ?? []) {
      write(standard, spec, conformingBody(spec));
    }
  }
}

writeConformingRecords();

// ---------------------------------------------------------------- stage 1 run

console.log(`# 適合ドリル — tenant ${tenantId}\n`);
console.log("## 第1段 記録層 — 適合すべきものは適合、壊したものは所定の指摘\n");
console.log("| 枠 | ケース | 期待どおり | 不一致 |");
console.log("|----|--------|------------|--------|");

const stage1Failures: string[] = [];
let stage1Total = 0;

for (const standard of STANDARDS) {
  const specs = loadRecordSpecs(standard)?.records ?? [];
  const cases: Case[] = [];
  for (const spec of specs) {
    cases.push({
      standard,
      file: spec.file,
      label: "適合するダミー",
      body: conformingBody(spec),
      expect: "conform",
    });
    cases.push(...ruleCases(standard, spec));
  }

  let ok = 0;
  for (const c of cases) {
    const spec = specs.find((s) => s.file === c.file)!;
    write(standard, spec, c.body);
    const issues = checkRecord(standard, spec).issues;
    if (matches(issues, c)) ok += 1;
    else {
      const got = issues.map((i) => `${i.severity}:${i.message}`).join(" / ") || "指摘なし";
      stage1Failures.push(`${standard} / ${c.file} — ${c.label}（期待 ${c.expect} · 実際 ${got}）`);
    }
    write(standard, spec, conformingBody(spec));
  }
  stage1Total += cases.length;
  console.log(`| ${standard} | ${cases.length} | ${ok} | ${cases.length - ok} |`);
}

console.log(`\n合計 ${stage1Total} ケース · 不一致 ${stage1Failures.length} 件`);
if (stage1Failures.length > 0) {
  console.log("\n### 期待と違ったケース\n");
  for (const f of stage1Failures) console.log(`- ${f}`);
}

// ---------------------------------------------------------------- stage 2 run

/** Bring every in-scope control up to its target so record faults stand alone. */
function writeControlsAtTarget(): void {
  const controls = loadControlMaps(listAvailableIsoIds());
  writeFileSync(
    join(tenantDir, "data", "compliance", "controls.yaml"),
    [
      'version: "1"',
      `as_of: ${isoDate()}`,
      "controls:",
      ...controls.map(
        (c) => `  - id: ${c.id}\n    maturity: ${c.target_maturity}\n    last_reviewed: ${isoDate()}`,
      ),
      "",
    ].join("\n"),
    "utf-8",
  );
}

mkdirSync(join(tenantDir, "data", "compliance"), { recursive: true });
writeControlsAtTarget();

/** Evidence paths a control needs that no record spec produces. */
function writeMissingEvidenceStubs(): void {
  for (const ctrl of listEffectiveControls()) {
    if (!ctrl.in_scope) continue;
    for (const path of ctrl.evidence_paths) {
      if (path.includes("*")) continue;
      const abs = resolveTenantPath(path);
      if (path.endsWith("/")) {
        mkdirSync(abs, { recursive: true });
        if (!existsSync(join(abs, "00-drill.md"))) {
          writeFileSync(join(abs, "00-drill.md"), `# ${ctrl.title}\n\n## 記録\n\nドリル用。\n`, "utf-8");
        }
        continue;
      }
      mkdirSync(dirname(abs), { recursive: true });
      if (existsSync(abs)) continue;
      writeFileSync(
        abs,
        path.endsWith(".md")
          ? `# ${ctrl.title}\n\n記入日: ${isoDate()} — ドリル用ダミー\n`
          : path.endsWith(".csv")
            ? "id,note\nDUMMY-001,ドリル用\n"
            : `version: "1"\nentries:\n  - id: DUMMY-001\n`,
        "utf-8",
      );
    }
  }
}

writeMissingEvidenceStubs();

interface Scenario {
  label: string;
  setup: () => void;
  expectOverall: "conform" | "conditionally_conform" | "nonconform";
  expectGap?: string;
  /** Gap the finding must carry alongside the deciding one. */
  expectOtherGap?: string;
}

/** A record that is present but wrong — the case a file-existence check misses. */
function firstRecordControl(): { path: string; standard: string; spec: IsoRecordSpec } | undefined {
  for (const standard of STANDARDS) {
    for (const spec of loadRecordSpecs(standard)?.records ?? []) {
      const path = recordRelPath(standard, spec);
      const claimed = listEffectiveControls().some(
        (c) => c.in_scope && c.evidence_paths.includes(path),
      );
      // A unique-key clash keeps the file filled in, so the audit cannot fall
      // back on "the form is blank" — it has to judge the content.
      if (claimed && spec.kind === "csv" && spec.rules.some((r) => r.kind === "unique")) {
        return { path, standard, spec };
      }
    }
  }
  return undefined;
}

const target = firstRecordControl();

const scenarios: Scenario[] = [
  {
    label: "基準状態（記録は適合・成熟度は目標）",
    setup: () => {
      writeConformingRecords();
      writeControlsAtTarget();
      writeMissingEvidenceStubs();
    },
    expectOverall: "conform",
  },
];

if (target) {
  scenarios.push(
    {
      label: `記録は埋まっているが内容が不正（${target.path}）`,
      setup: () => {
        writeConformingRecords();
        const rows = buildRows(target.spec);
        const unique = target.spec.rules.find((r) => r.kind === "unique");
        if (unique && unique.kind === "unique") {
          for (const col of unique.columns) rows[1]![col] = rows[0]![col]!;
        }
        write(target.standard, target.spec, serializeCsv(target.spec, rows));
      },
      expectOverall: "conditionally_conform",
      expectGap: "record_invalid",
    },
    {
      // The form is blank *and* the register behind it is malformed. The
      // verdict comes from the blank form; the malformed register must still
      // reach the operator.
      label: `様式が未記入かつ内容も不正（${target.path}）`,
      setup: () => {
        writeConformingRecords();
        write(target.standard, target.spec, serializeCsv(target.spec, []));
      },
      expectOverall: "nonconform",
      expectGap: "doc_missing",
      expectOtherGap: "record_invalid",
    },
    {
      label: `記録を削除する（${target.path}）`,
      setup: () => {
        writeConformingRecords();
        rmSync(resolveTenantPath(target.path), { force: true });
      },
      expectOverall: "nonconform",
      expectGap: "doc_missing",
    },
  );
}

scenarios.push({
  label: "統制成熟度を L0 に落とす",
  setup: () => {
    writeConformingRecords();
    writeFileSync(
      join(tenantDir, "data", "compliance", "controls.yaml"),
      ['version: "1"', `as_of: ${isoDate()}`, "controls: []", ""].join("\n"),
      "utf-8",
    );
  },
  expectOverall: "nonconform",
  expectGap: "maturity_below_target",
});

console.log("\n## 第2段 内部監査 — 仕込んだ不適合を監査が拾うか\n");
console.log("| シナリオ | 期待 | 実際 | 主ギャップ | 併記ギャップ | 判定 |");
console.log("|----------|------|------|------------|--------------|------|");

const stage2Failures: string[] = [];
for (const scenario of scenarios) {
  scenario.setup();
  const run = evaluateIsoInternalAudit();
  const matched = scenario.expectGap
    ? run.findings.filter((f) => f.gap_type === scenario.expectGap)
    : run.findings;
  const gapSeen = !scenario.expectGap || matched.length > 0;
  const otherSeen =
    !scenario.expectOtherGap ||
    matched.some((f) => f.other_gaps.some((g) => g.gap_type === scenario.expectOtherGap));
  const overallOk = run.overall === scenario.expectOverall;
  const ok = overallOk && gapSeen && otherSeen;
  console.log(
    `| ${scenario.label} | ${scenario.expectOverall} | ${run.overall} | ${scenario.expectGap ?? "—"}${gapSeen ? " ○" : " ×"} | ${scenario.expectOtherGap ?? "—"}${otherSeen ? " ○" : " ×"} | ${ok ? "○" : "×"} |`,
  );
  if (!ok) {
    stage2Failures.push(
      `${scenario.label}: 総合 ${run.overall}（期待 ${scenario.expectOverall}）· 主 ${scenario.expectGap ?? "—"} ${gapSeen ? "検出" : "未検出"} · 併記 ${scenario.expectOtherGap ?? "—"} ${otherSeen ? "検出" : "未検出"}`,
    );
  }
}

if (stage2Failures.length > 0) {
  console.log("\n### 期待と違ったシナリオ\n");
  for (const f of stage2Failures) console.log(`- ${f}`);
}

if (!keep) rmSync(tenantDir, { recursive: true, force: true });
else console.log(`\ntenant を残した: ${tenantDir}`);

process.exitCode = stage1Failures.length + stage2Failures.length > 0 ? 1 : 0;
