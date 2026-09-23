import { existsSync, readFileSync } from "node:fs";
import type { IsoRecordSpec } from "../../../../schemas/iso-record-spec.js";
import { parseCsv } from "../../csv.js";
import { resolveTenantPath } from "../../tenant.js";
import { evaluateCsv, evaluateMarkdown, evaluateYaml, yamlListLength } from "./evaluate.js";
import {
  loadRecordSpecs,
  recordRelPath,
  type IsoRecordIssue,
  type IsoRecordReport,
} from "./spec.js";

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
