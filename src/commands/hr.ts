import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildHeadcountView,
  formatHeadcountMarkdown,
} from "../lib/hr/headcount-view.js";
import { applyHrOnboard } from "../lib/hr/onboard.js";
import {
  assessTrainingCoverage,
  buildCompetenceMatrix,
} from "../lib/hr/competence.js";
import {
  formatCompetenceMapMarkdown,
  formatTrainingPlanMarkdown,
  formatTrainingRecordsMarkdown,
} from "../lib/hr/competence-view.js";
import { resolveTenantPath } from "../lib/tenant.js";

export function runHrHeadcount(options?: { json?: boolean }): void {
  const view = buildHeadcountView();
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatHeadcountMarkdown(view));
}

export function runHrOnboard(options: {
  name?: string;
  hired_date?: string;
  write?: boolean;
  json?: boolean;
  fromAgent?: string;
}): void {
  const name = options.name?.trim();
  if (!name) {
    throw new Error("hr onboard requires --name <氏名>");
  }
  const input = options.hired_date
    ? { name, hired_date: options.hired_date }
    : { name };
  const result = applyHrOnboard(input, {
    write: Boolean(options.write),
    fromAgent: options.fromAgent,
  });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.reply);
    if (result.work_order_ids.length) {
      console.log(`Work Orders: ${result.work_order_ids.join(", ")}`);
    }
  }
  if (!result.ok && options.write) process.exitCode = 1;
}

/** Evidence folder for ISO 21401 7.2. Generated documents live here. */
export const COMPETENCE_DOCS_REL =
  "docs/compliance/iso/ISO-21401/competence";

const OUTPUTS = {
  map: { file: "力量マップ.md", render: formatCompetenceMapMarkdown },
  plan: { file: "研修計画-fy2026.md", render: formatTrainingPlanMarkdown },
  records: { file: "研修実施記録.md", render: formatTrainingRecordsMarkdown },
} as const;

export type CompetenceView = keyof typeof OUTPUTS;

export interface HrCompetenceOptions {
  json?: boolean;
  write?: boolean;
}

export function runHrCompetence(
  view: CompetenceView,
  options: HrCompetenceOptions = {},
): void {
  if (options.json) {
    const matrix = buildCompetenceMatrix();
    const payload =
      view === "map"
        ? matrix
        : { matrix, coverage: assessTrainingCoverage(matrix) };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const { file, render } = OUTPUTS[view];
  const markdown = render();
  if (!options.write) {
    console.log(markdown);
    return;
  }
  const path = resolveTenantPath(join(COMPETENCE_DOCS_REL, file));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown, "utf-8");
  console.log(`✓ ${join(COMPETENCE_DOCS_REL, file)}`);
}

/** Fails when the map is internally inconsistent or a statutory gap is unplanned. */
export function runHrCompetenceCheck(options: { json?: boolean } = {}): void {
  const matrix = buildCompetenceMatrix();
  const coverage = assessTrainingCoverage(matrix);
  const statutoryUncovered = coverage.uncovered.filter((c) => c.statutory);
  const result = {
    ok: matrix.issues.length === 0 && statutoryUncovered.length === 0,
    gaps: matrix.gaps.length,
    statutory_gaps: matrix.gaps.filter((g) => g.statutory).length,
    uncovered: coverage.uncovered.length,
    statutory_uncovered: statutoryUncovered.length,
    follow_up: coverage.follow_up.length,
    issues: [...matrix.issues, ...coverage.issues],
  };
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `力量ギャップ ${result.gaps} 件（法定 ${result.statutory_gaps}）· 研修未計画 ${result.uncovered} 件（法定 ${result.statutory_uncovered}）· 要追加措置 ${result.follow_up} 件`,
    );
    for (const i of result.issues) console.log(`  - ${i}`);
    console.log(result.ok ? "✓ 力量マップと研修計画は整合している" : "✗ 是正が必要");
  }
  if (!result.ok) process.exitCode = 1;
}
