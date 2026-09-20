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

export const contractTermsSchema = z.object({
  engagement: z.string().min(1),
  hours: z.number().nonnegative(),
  currency: z.string().min(1),
  max_total: z.number().nonnegative(),
});

export const passKeyApprovalPayloadSchema = z.object({
  rfp_title: z.string().min(1),
  candidate_ids: z.array(z.string().min(1)),
  terms: contractTermsSchema,
});

export type TalentCandidate = z.output<typeof talentCandidateSchema>;
export type ContractTerms = z.output<typeof contractTermsSchema>;
export type PassKeyApprovalPayload = z.output<typeof passKeyApprovalPayloadSchema>;

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
