import { readFileSync } from "node:fs";
import YAML from "yaml";
import {
  recruitingJobSchema,
  regularPrerequisitesSchema,
  type RecruitingJob,
  type RegularPrerequisites,
} from "../../../schemas/talent-hiring.js";

const FORBIDDEN_KEYS = ["age", "gender", "birth_date"] as const;

function forbiddenKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return FORBIDDEN_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export type LoadRecruitingJobResult =
  | { status: "rejected"; reason: string }
  | { status: "ready"; job: RecruitingJob };

export function prerequisitesFromCompanyReadiness(
  readiness: NonNullable<RecruitingJob["company_readiness"]>,
): RegularPrerequisites | null {
  if (
    !readiness.work_rules_ref ||
    !readiness.dismissal_ground_refs?.length ||
    !readiness.notice_procedure
  ) {
    return null;
  }
  const parsed = regularPrerequisitesSchema.safeParse({
    work_rules_ref: readiness.work_rules_ref,
    dismissal_ground_refs: readiness.dismissal_ground_refs,
    notice_procedure: readiness.notice_procedure,
    probation_days: 0,
    labor_conditions: {
      period_fixed: false,
      wage: "未記入",
      work_hours: "未記入",
      workplace: "未記入",
    },
  });
  return parsed.success ? parsed.data : null;
}

export function loadRecruitingJob(input: unknown): LoadRecruitingJobResult {
  const forbidden = [
    ...forbiddenKeys(input),
    ...(input && typeof input === "object" && !Array.isArray(input) && "posting" in input
      ? forbiddenKeys((input as { posting: unknown }).posting)
      : []),
    ...(input && typeof input === "object" && !Array.isArray(input) && Array.isArray((input as { candidates?: unknown }).candidates)
      ? (input as { candidates: unknown[] }).candidates.flatMap((row) => forbiddenKeys(row))
      : []),
  ];
  if (forbidden.length > 0) {
    return { status: "rejected", reason: `年齢・性別では選考しない（${[...new Set(forbidden)].join(", ")}）` };
  }

  const parsed = recruitingJobSchema.safeParse(input);
  if (!parsed.success) return { status: "rejected", reason: "採用ジョブを読めません" };

  const job = parsed.data;
  if (job.terms.engagement !== job.engagement) {
    return { status: "rejected", reason: "選んだ契約形態と terms.engagement が一致しません" };
  }

  if (job.engagement === "regular" && !job.prerequisites && job.company_readiness) {
    const derived = prerequisitesFromCompanyReadiness(job.company_readiness);
    if (derived) {
      return { status: "ready", job: { ...job, prerequisites: derived } };
    }
  }

  return { status: "ready", job };
}

export function loadRecruitingJobFromPath(path: string): LoadRecruitingJobResult {
  return loadRecruitingJob(YAML.parse(readFileSync(path, "utf8")));
}
