import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { assessAuditorEligibility } from "./iso-audit-plan.js";
import { assessRequirementCoverage } from "./iso-requirements.js";
import { checkRecordsForStandard } from "./iso-records.js";
import { findOperatorById } from "./org/operators.js";
import { getDataDir, readYamlFile } from "./utils.js";

const REL = "jp-jsox";

const scopeFileSchema = z.object({
  version: z.string().optional(),
  areas: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        in_scope: z.boolean().default(true),
        cross_ref: z.string().optional(),
      }),
    )
    .default([]),
});

const processFileSchema = z.object({
  version: z.string().optional(),
  processes: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        module: z.string().min(1),
        records: z.string().optional(),
      }),
    )
    .default([]),
});

const itgcFileSchema = z.object({
  version: z.string().optional(),
  checks: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        ref: z.string().optional(),
      }),
    )
    .default([]),
});

function dir(): string {
  return join(getDataDir(), REL);
}

export function loadJsoxScope() {
  const path = join(dir(), "scope.yaml");
  if (!existsSync(path)) return scopeFileSchema.parse({ areas: [] });
  return readYamlFile(path, scopeFileSchema);
}

export function loadJsoxProcesses() {
  const path = join(dir(), "processes.yaml");
  if (!existsSync(path)) return processFileSchema.parse({ processes: [] });
  return readYamlFile(path, processFileSchema);
}

export function loadJsoxItgc() {
  const path = join(dir(), "itgc.yaml");
  if (!existsSync(path)) return itgcFileSchema.parse({ checks: [] });
  return readYamlFile(path, itgcFileSchema);
}

export function jsoxStatus(): {
  scope_areas: number;
  processes: number;
  itgc_checks: number;
  requirement_gaps: string[];
  record_errors: number;
} {
  const coverage = assessRequirementCoverage("jsox");
  const records = checkRecordsForStandard("jsox");
  return {
    scope_areas: loadJsoxScope().areas.length,
    processes: loadJsoxProcesses().processes.length,
    itgc_checks: loadJsoxItgc().checks.length,
    requirement_gaps: coverage.uncovered.map((r) => r.id),
    record_errors: records.reduce((n, r) => n + r.issues.filter((i) => i.severity === "error").length, 0),
  };
}

export function jsoxGaps(): string[] {
  const gaps: string[] = [];
  const scope = loadJsoxScope();
  if (scope.areas.length === 0) gaps.push("評価範囲（data/jp-jsox/scope.yaml）が空です");
  if (loadJsoxProcesses().processes.length === 0) gaps.push("業務プロセス参照が空です");
  if (loadJsoxItgc().checks.length === 0) gaps.push("ITGC チェックが空です");
  const coverage = assessRequirementCoverage("jsox");
  for (const r of coverage.uncovered) gaps.push(`未被覆の要求: ${r.id}`);
  for (const report of checkRecordsForStandard("jsox")) {
    for (const issue of report.issues.filter((i) => i.severity === "error")) {
      gaps.push(`${report.file}: ${issue.message}`);
    }
  }
  return gaps;
}

export function jsoxEvaluate(operatorId: string): {
  ok: boolean;
  refused?: string;
  gaps: string[];
} {
  const operator = findOperatorById(operatorId);
  if (!operator) {
    return { ok: false, refused: `operator ${operatorId} が登録されていません`, gaps: jsoxGaps() };
  }
  const allowed = operator.allowed_agents ?? [];
  if (allowed.includes("finance")) {
    return {
      ok: false,
      refused: "finance が自プロセスを evaluate して閉じることはできません（内部監査の独立性）",
      gaps: jsoxGaps(),
    };
  }
  const eligibility = assessAuditorEligibility(operatorId, "jsox", []);
  if (!eligibility.eligible) {
    const reasons = [
      eligibility.conflicting_agents.length > 0
        ? `独立性: ${eligibility.conflicting_agents.join(", ")}`
        : undefined,
      eligibility.competence_issue,
    ].filter(Boolean);
    return { ok: false, refused: reasons.join(" · "), gaps: jsoxGaps() };
  }
  const gaps = jsoxGaps();
  return { ok: gaps.length === 0, gaps };
}

export function formatJsoxStatus(): string {
  const s = jsoxStatus();
  return [
    "# J-SOX 内部評価",
    "",
    "内部統制報告書・EDINET 提出は行いません。",
    "",
    `| 評価範囲 | プロセス | ITGC | 記録不備 |`,
    `|----------|----------|------|----------|`,
    `| ${s.scope_areas} | ${s.processes} | ${s.itgc_checks} | ${s.record_errors} |`,
  ].join("\n");
}
