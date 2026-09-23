import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  itgcFileSchema,
  processFileSchema,
  scopeFileSchema,
  type JsoxItgcFile,
  type JsoxProcessFile,
  type JsoxScopeFile,
} from "../../../../schemas/jp-jsox.js";
import { assessAuditorEligibility, describeEligibilityFailure } from "../audit/eligibility.js";
import { assessRequirementCoverage } from "../../iso-requirements.js";
import { checkRecordsForStandard } from "../../iso-records.js";
import { findOperatorById } from "../../org/operators.js";
import { getDataDir, readYamlFile } from "../../utils.js";

const REL = "jp-jsox";

function dir(): string {
  return join(getDataDir(), REL);
}

export function loadJsoxScope(): JsoxScopeFile {
  const path = join(dir(), "scope.yaml");
  return existsSync(path)
    ? readYamlFile(path, scopeFileSchema)
    : scopeFileSchema.parse({ areas: [] });
}

export function loadJsoxProcesses(): JsoxProcessFile {
  const path = join(dir(), "processes.yaml");
  return existsSync(path)
    ? readYamlFile(path, processFileSchema)
    : processFileSchema.parse({ processes: [] });
}

export function loadJsoxItgc(): JsoxItgcFile {
  const path = join(dir(), "itgc.yaml");
  return existsSync(path)
    ? readYamlFile(path, itgcFileSchema)
    : itgcFileSchema.parse({ checks: [] });
}

interface JsoxAssessment {
  scope: JsoxScopeFile;
  processes: JsoxProcessFile;
  itgc: JsoxItgcFile;
  requirementGaps: string[];
  recordGaps: string[];
}

function evaluateJsoxEvidence(): JsoxAssessment {
  const coverage = assessRequirementCoverage("jsox");
  const records = checkRecordsForStandard("jsox");
  return {
    scope: loadJsoxScope(),
    processes: loadJsoxProcesses(),
    itgc: loadJsoxItgc(),
    requirementGaps: coverage.uncovered.map((requirement) => requirement.id),
    recordGaps: records.flatMap((report) =>
      report.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => `${report.file}: ${issue.message}`)
    ),
  };
}

function gapsFrom(assessment: JsoxAssessment): string[] {
  const gaps: string[] = [];
  if (assessment.scope.areas.length === 0) {
    gaps.push("評価範囲（data/jp-jsox/scope.yaml）が空です");
  }
  if (assessment.processes.processes.length === 0) gaps.push("業務プロセス参照が空です");
  if (assessment.itgc.checks.length === 0) gaps.push("ITGC チェックが空です");
  for (const requirementId of assessment.requirementGaps) {
    gaps.push(`未被覆の要求: ${requirementId}`);
  }
  gaps.push(...assessment.recordGaps);
  return gaps;
}

export function jsoxStatus(): {
  scope_areas: number;
  processes: number;
  itgc_checks: number;
  requirement_gaps: string[];
  record_errors: number;
} {
  const assessment = evaluateJsoxEvidence();
  return {
    scope_areas: assessment.scope.areas.length,
    processes: assessment.processes.processes.length,
    itgc_checks: assessment.itgc.checks.length,
    requirement_gaps: assessment.requirementGaps,
    record_errors: assessment.recordGaps.length,
  };
}

export function jsoxGaps(): string[] {
  return gapsFrom(evaluateJsoxEvidence());
}

export function jsoxEvaluate(operatorId: string): {
  ok: boolean;
  refused?: string;
  gaps: string[];
} {
  const assessment = evaluateJsoxEvidence();
  const gaps = gapsFrom(assessment);
  const operator = findOperatorById(operatorId);
  if (!operator) {
    return { ok: false, refused: `operator ${operatorId} が登録されていません`, gaps };
  }
  if ((operator.allowed_agents ?? []).includes("finance")) {
    return {
      ok: false,
      refused: "finance が自プロセスを evaluate して閉じることはできません（内部監査の独立性）",
      gaps,
    };
  }
  const eligibility = assessAuditorEligibility(operatorId, "jsox", []);
  if (!eligibility.eligible) {
    return { ok: false, refused: describeEligibilityFailure(eligibility), gaps };
  }
  return { ok: gaps.length === 0, gaps };
}

export function formatJsoxStatus(): string {
  const status = jsoxStatus();
  return [
    "# J-SOX 内部評価",
    "",
    "内部統制報告書・EDINET 提出は行いません。",
    "",
    "| 評価範囲 | プロセス | ITGC | 記録不備 |",
    "|----------|----------|------|----------|",
    `| ${status.scope_areas} | ${status.processes} | ${status.itgc_checks} | ${status.record_errors} |`,
  ].join("\n");
}
