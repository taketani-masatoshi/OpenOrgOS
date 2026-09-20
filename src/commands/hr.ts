import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import {
  buildHeadcountView,
  formatHeadcountMarkdown,
} from "../lib/hr/headcount-view.js";
import {
  assessTrainingCoverage,
  buildCompetenceMatrix,
} from "../lib/hr/competence.js";
import {
  formatCompetenceMapMarkdown,
  formatTrainingPlanMarkdown,
  formatTrainingRecordsMarkdown,
} from "../lib/hr/competence-view.js";
import { buildPlatformListings } from "../lib/hr/talent-hiring/platform-listings.js";
import { proposeReach } from "../lib/hr/talent-hiring/reach-proposal.js";
import { hearJobRequest } from "../lib/hr/talent-hiring/hear-job.js";
import { recommendEngagement } from "../lib/hr/talent-hiring/recommend-engagement.js";
import {
  evaluateDismissalReadiness,
  prepareDismissalReadinessChecklist,
  writeDismissalReadinessShells,
} from "../lib/hr/dismissal-readiness.js";
import {
  confirmHiringWorksite,
  writeHiringWorksite,
} from "../lib/hr/hiring-worksite.js";
import { loadRecruitingJobFromPath } from "../lib/hr/recruiting-job.js";
import { runTalentFlow } from "../lib/hr/talent-flow.js";
import { runTalentPack } from "../lib/hr/talent-pack.js";
import { shortlistForPosting, type TalentShortlistResult } from "../lib/hr/talent-shortlist.js";
import type {
  DismissalReadinessChecklist,
  DismissalReadinessResult,
  EngagementDiscussResult,
  EngagementKind,
  HiringPack,
  JobCategoryChoiceId,
  JobHearingResult,
  JobPosting,
  PassiveSmokingChoiceId,
  PlatformListingResult,
  ReachProposalResult,
  WorksiteConfirmResult,
} from "../../schemas/talent-hiring.js";
import {
  engagementKindSchema,
  jobCategoryChoiceIdSchema,
  jobPostingSchema,
  passiveSmokingChoiceIdSchema,
} from "../../schemas/talent-hiring.js";
import { getDocsDir } from "../lib/utils.js";
import { resolveTenantPath } from "../lib/tenant.js";

export function runHrHeadcount(options?: { json?: boolean }): void {
  const view = buildHeadcountView();
  if (options?.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(formatHeadcountMarkdown(view));
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

export function runHrTalentHear(options: { answers: unknown; json?: boolean }): JobHearingResult {
  const result = hearJobRequest(options.answers);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  return result;
}

export function runHrWorksiteConfirm(options: {
  worksite: unknown;
  passiveSmoking?: string;
  jobCategory?: string;
  writePath?: string;
  json?: boolean;
}): WorksiteConfirmResult | { status: "rejected"; reason: string } {
  const choices: {
    passive_smoking_choice?: PassiveSmokingChoiceId;
    job_category_choice?: JobCategoryChoiceId;
  } = {};
  if (options.passiveSmoking) {
    choices.passive_smoking_choice = passiveSmokingChoiceIdSchema.parse(options.passiveSmoking);
  }
  if (options.jobCategory) {
    choices.job_category_choice = jobCategoryChoiceIdSchema.parse(options.jobCategory);
  }
  const result = confirmHiringWorksite(options.worksite, choices);
  if (result.status === "ready" && options.writePath) {
    writeHiringWorksite(options.writePath, result.worksite);
  }
  if (options.json) console.log(JSON.stringify(result, null, 2));
  return result;
}

export function runHrTalentPlatforms(options: {
  facts: unknown;
  json?: boolean;
}): PlatformListingResult {
  const result = buildPlatformListings(options.facts);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  return result;
}

export function runHrTalentReach(options: {
  wish: unknown;
  json?: boolean;
}): ReachProposalResult {
  const result = proposeReach(options.wish);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  return result;
}

export function runHrTalentDiscuss(options: {
  answers: unknown;
  json?: boolean;
}): EngagementDiscussResult {
  const result = recommendEngagement(options.answers);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  return result;
}

export function runHrDismissalReadiness(options: {
  ledger: unknown;
  prepare?: boolean;
  write?: boolean;
  docsRoot?: string;
  json?: boolean;
}): DismissalReadinessResult | (DismissalReadinessResult & { checklist: DismissalReadinessChecklist }) {
  const docsRoot = options.docsRoot;
  let ledger = options.ledger;
  if (options.write) {
    if (!docsRoot) throw new Error("dismissal-readiness --write requires docsRoot");
    const written = writeDismissalReadinessShells({ ledger, docsRoot });
    ledger = written.ledger;
  }
  const result = evaluateDismissalReadiness(ledger, { docsRoot });
  if (options.prepare || options.write) {
    const checklist = prepareDismissalReadinessChecklist(ledger, { docsRoot });
    const combined = { ...result, checklist };
    if (options.json) console.log(JSON.stringify(combined, null, 2));
    return combined;
  }
  if (options.json) console.log(JSON.stringify(result, null, 2));
  return result;
}

export function runHrTalentPack(options: {
  posting: unknown;
  engagement: unknown;
  director: string;
  writeDir?: string;
  json?: boolean;
}): HiringPack & { written_path?: string } {
  const posting = jobPostingSchema.parse(options.posting);
  const engagement = engagementKindSchema.parse(options.engagement) as EngagementKind;
  const pack = runTalentPack({
    posting: posting as JobPosting,
    engagement,
    director: options.director,
    writeDir: options.writeDir,
  });
  if (options.json) console.log(JSON.stringify(pack, null, 2));
  return pack;
}

export function runHrTalentFlow(options: {
  job: unknown;
  docsRoot?: string;
  packWriteDir?: string;
  json?: boolean;
}) {
  const result = runTalentFlow({
    job: options.job,
    docsRoot: options.docsRoot,
    packWriteDir: options.packWriteDir,
  });
  if (options.json) console.log(JSON.stringify(result, null, 2));
  return result;
}

export function runHrTalentShortlist(options: {
  posting: unknown;
  candidates: unknown;
  terms: unknown;
  prerequisites?: unknown;
  company_readiness?: unknown;
  docsRoot?: string;
  proposedBy: string;
  operatorId: string;
  approverId: string;
  apiOrigin: string;
  json?: boolean;
}): TalentShortlistResult {
  const result = shortlistForPosting(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  return result;
}

export function loadTalentHearAnswers(path: string): unknown {
  return YAML.parse(readFileSync(path, "utf8"));
}

export { loadRecruitingJobFromPath, getDocsDir };
