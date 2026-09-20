import { z } from "zod";
import { dateString } from "./common.js";

export const talentCandidateSchema = z
  .object({
    candidate_id: z.string().min(1),
    display_name: z.string().min(1),
    hourly_rate: z.number().nonnegative(),
    learns_procedure: z.boolean(),
    follows_any_supervisor: z.boolean(),
    adapts_to_one_change: z.boolean(),
    reports_exceptions: z.boolean(),
    safe_workwear: z.boolean(),
  })
  .strict();

export const engagementKindSchema = z.enum(["contractor", "fixed_term", "regular"]);

export const contractTermsSchema = z.object({
  engagement: engagementKindSchema,
  hours: z.number().nonnegative(),
  currency: z.string().min(1),
  max_total: z.number().nonnegative(),
});

export const noticeProcedureSchema = z.enum(["thirty_day_notice", "notice_allowance"]);

export const laborConditionsSchema = z.object({
  period_fixed: z.boolean(),
  wage: z.string().min(1),
  work_hours: z.string().min(1),
  workplace: z.string().min(1),
});

export const regularPrerequisitesSchema = z
  .object({
    work_rules_ref: z.string().min(1),
    dismissal_ground_refs: z.array(z.string().min(1)).min(1),
    notice_procedure: noticeProcedureSchema,
    probation_days: z.number().int().nonnegative(),
    labor_conditions: laborConditionsSchema,
  })
  .strict();

export const passKeyApprovalPayloadSchema = z.object({
  rfp_title: z.string().min(1),
  candidate_ids: z.array(z.string().min(1)),
  terms: contractTermsSchema,
  engagement: engagementKindSchema,
  prerequisites: z
    .object({
      work_rules_ref: z.string().min(1),
      dismissal_ground_refs: z.array(z.string().min(1)).min(1),
      notice_procedure: noticeProcedureSchema,
      probation_days: z.number().int().nonnegative(),
    })
    .optional(),
});

export type EngagementKind = z.output<typeof engagementKindSchema>;
export type TalentCandidate = z.output<typeof talentCandidateSchema>;
export type ContractTerms = z.output<typeof contractTermsSchema>;
export type RegularPrerequisites = z.output<typeof regularPrerequisitesSchema>;
export type PassKeyApprovalPayload = z.output<typeof passKeyApprovalPayloadSchema>;

export const engagementDiscussAnswersSchema = z
  .object({
    company_directs: z.boolean().optional(),
    fixed_term_days: z.number().int().positive().nullable().optional(),
    deliverable_only: z.boolean().optional(),
  })
  .strict();

export const engagementDiscussQuestionFieldSchema = z.enum([
  "company_directs",
  "fixed_term_days",
  "deliverable_only",
]);

export type EngagementDiscussAnswers = z.output<typeof engagementDiscussAnswersSchema>;
export type EngagementDiscussQuestionField = z.output<typeof engagementDiscussQuestionFieldSchema>;

export interface EngagementDiscussQuestion {
  field: EngagementDiscussQuestionField;
  prompt: string;
}

export interface EngagementOption {
  engagement: EngagementKind;
  reasons: string[];
  requires_prerequisites?: boolean;
}

export type EngagementDiscussResult =
  | { status: "need_answers"; questions: EngagementDiscussQuestion[] }
  | { status: "rejected"; reason: string }
  | {
      status: "ready";
      recommended: EngagementKind;
      options: EngagementOption[];
    };

export interface HiringPack {
  engagement: EngagementKind;
  internal_job_summary: string;
  exit_name: string;
  notes: string[];
}

export const dismissalReadinessLedgerSchema = z
  .object({
    work_rules_ref: z.string().min(1).optional(),
    dismissal_ground_refs: z.array(z.string().min(1)).optional(),
    notice_procedure: noticeProcedureSchema.optional(),
    labor_condition_notice_template_ref: z.string().min(1).optional(),
    guidance_process_ref: z.string().min(1).optional(),
    fact_record_policy_ref: z.string().min(1).optional(),
    probation_policy_ref: z.string().min(1).optional(),
  })
  .strict();

export type DismissalReadinessLedger = z.output<typeof dismissalReadinessLedgerSchema>;

export type DismissalReadinessVerdict = "not_ready" | "documents_present";

export interface DismissalReadinessItem {
  id: string;
  present: boolean;
  required: boolean;
}

export interface DismissalReadinessAction {
  id: string;
  ref: string;
  purpose: string;
}

export type DismissalReadinessResult =
  | { status: "rejected"; reason: string }
  | {
      status: "ready";
      score: number;
      documents_present: boolean;
      verdict: DismissalReadinessVerdict;
      items: DismissalReadinessItem[];
      missing: string[];
      notes: string[];
    };

export interface DismissalReadinessChecklist {
  actions: DismissalReadinessAction[];
  notes: string[];
}

export const jobHearingAnswersSchema = z
  .object({
    work_summary: z.string().min(1).optional(),
    starts_on: dateString.optional(),
    duration_days: z.number().int().positive().optional(),
    headcount: z.number().int().positive().optional(),
    max_hourly_rate: z.number().positive().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  })
  .strict();

export const jobHearingQuestionFieldSchema = z.enum([
  "work_summary",
  "starts_on",
  "duration_days",
  "headcount",
  "pay",
]);

export const practicalCheckSchema = z.enum([
  "説明のあと、手順を一人で1サイクル完了できる",
  "指示者の年齢や役職に関係なく、担当者の指示どおりに動ける",
  "作業中の手順変更1つに合わせられる",
  "わからないことと異常をその場で報告できる",
  "指定の服装で、髪・爪・装飾が作業の妨げにならない",
]);

export const jobPostingSchema = z.object({
  title: z.string().min(1),
  starts_on: dateString,
  duration_days: z.number().int().positive(),
  headcount: z.number().int().positive(),
  max_hourly_rate: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  duties: z.string().min(1),
  checks: z.array(practicalCheckSchema).length(5),
  body: z.string().min(1),
});

export type JobHearingAnswers = z.output<typeof jobHearingAnswersSchema>;
export type JobHearingQuestionField = z.output<typeof jobHearingQuestionFieldSchema>;
export type JobPosting = z.output<typeof jobPostingSchema>;

export interface JobHearingQuestion {
  field: JobHearingQuestionField;
  prompt: string;
}

export type JobHearingResult =
  | { status: "need_answers"; questions: JobHearingQuestion[] }
  | { status: "rejected"; reason: string }
  | { status: "ready"; posting: JobPosting };

/** 求人媒体（タイミー等）で選ばせる受動喫煙区分。自由記述させない。 */
export const passiveSmokingChoiceIdSchema = z.enum([
  "indoor_smoke_free",
  "smoking_room",
  "heated_tobacco_room",
  "smoking_allowed_exception",
  "outdoor_work",
]);

/** 短期・単発向けの業種・職種ラベル。自由記述させない。 */
export const jobCategoryChoiceIdSchema = z.enum([
  "light_work",
  "warehouse_logistics",
  "cleaning",
  "office_assist",
  "food_service",
  "other",
]);

export const worksiteStationSchema = z
  .object({
    line: z.string().min(1),
    station: z.string().min(1),
    walk_minutes: z.number().int().nonnegative(),
    exit: z.string().min(1).optional(),
  })
  .strict();

export const hiringWorksiteSchema = z
  .object({
    worksite_id: z.string().min(1),
    display_name: z.string().min(1),
    address: z
      .object({
        prefecture: z.string().min(1),
        city: z.string().min(1),
        line1: z.string().min(1),
        building: z.string().min(1).optional(),
        unit: z.string().min(1).optional(),
        postal_code: z.string().min(1).optional(),
      })
      .strict(),
    access: z
      .object({
        nearest_stations: z.array(worksiteStationSchema).min(1),
        entry_method: z.string().min(1),
      })
      .strict(),
    passive_smoking_fact: z.string().min(1),
    passive_smoking_choice: passiveSmokingChoiceIdSchema.optional(),
    job_category_choice: jobCategoryChoiceIdSchema.optional(),
    suggested_job_category: jobCategoryChoiceIdSchema.optional(),
    confirmed_at: dateString.optional(),
  })
  .strict();

export type PassiveSmokingChoiceId = z.output<typeof passiveSmokingChoiceIdSchema>;
export type JobCategoryChoiceId = z.output<typeof jobCategoryChoiceIdSchema>;
export type HiringWorksite = z.output<typeof hiringWorksiteSchema>;

export interface CatalogChoice<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

export type WorksiteConfirmResult =
  | {
      status: "need_choices";
      worksite: HiringWorksite;
      missing: Array<"passive_smoking_choice" | "job_category_choice">;
      passive_smoking_options: CatalogChoice<PassiveSmokingChoiceId>[];
      job_category_options: CatalogChoice<JobCategoryChoiceId>[];
      recommended?: {
        passive_smoking_choice?: PassiveSmokingChoiceId;
        job_category_choice?: JobCategoryChoiceId;
      };
    }
  | { status: "ready"; worksite: HiringWorksite };

export const recruitingJobSchema = z
  .object({
    job_id: z.string().min(1),
    posting: jobPostingSchema,
    engagement: engagementKindSchema,
    director: z.string().min(1),
    candidates: z.array(talentCandidateSchema),
    terms: contractTermsSchema,
    worksite_id: z.string().min(1).optional(),
    company_readiness: dismissalReadinessLedgerSchema.optional(),
    prerequisites: regularPrerequisitesSchema.optional(),
    proposed_by: z.string().min(1).default("recruiting"),
    operator_id: z.string().min(1),
    approver_id: z.string().min(1),
    api_origin: z.string().url(),
  })
  .strict();

export type RecruitingJob = z.output<typeof recruitingJobSchema>;
