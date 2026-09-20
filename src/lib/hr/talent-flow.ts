import type { HiringPack } from "../../../schemas/talent-hiring.js";
import {
  evaluateDismissalReadiness,
  type DismissalReadinessOptions,
} from "./dismissal-readiness.js";
import { loadRecruitingJob, type LoadRecruitingJobResult } from "./recruiting-job.js";
import { runTalentPack } from "./talent-pack.js";
import { shortlistForPosting, type TalentShortlistResult } from "./talent-shortlist.js";

export type TalentFlowResult =
  | { status: "rejected"; reason: string }
  | { status: "need_prerequisites"; missing: string[] }
  | {
      status: "ready";
      pack: HiringPack;
      shortlist: Extract<TalentShortlistResult, { status: "ready" }>;
    };

export function runTalentFlow(input: {
  job: unknown;
  docsRoot?: string;
  packWriteDir?: string;
}): TalentFlowResult {
  const loaded: LoadRecruitingJobResult = loadRecruitingJob(input.job);
  if (loaded.status === "rejected") return loaded;

  const job = loaded.job;
  const readinessOpts: DismissalReadinessOptions = input.docsRoot
    ? { docsRoot: input.docsRoot }
    : {};

  if (job.engagement === "regular") {
    const company = evaluateDismissalReadiness(job.company_readiness ?? {}, readinessOpts);
    if (company.status === "rejected") return { status: "rejected", reason: company.reason };
    if (!company.documents_present) {
      return {
        status: "need_prerequisites",
        missing: company.missing.map((id) => `company_readiness.${id}`),
      };
    }
  }

  const pack = runTalentPack({
    posting: job.posting,
    engagement: job.engagement,
    director: job.director,
    writeDir: input.packWriteDir,
  });

  const shortlist = shortlistForPosting({
    posting: job.posting,
    candidates: job.candidates,
    terms: job.terms,
    prerequisites: job.prerequisites,
    company_readiness: job.company_readiness,
    proposedBy: job.proposed_by,
    operatorId: job.operator_id,
    approverId: job.approver_id,
    apiOrigin: job.api_origin,
    docsRoot: input.docsRoot,
  });

  if (shortlist.status === "rejected") return shortlist;
  if (shortlist.status === "need_prerequisites") return shortlist;
  return { status: "ready", pack, shortlist };
}
