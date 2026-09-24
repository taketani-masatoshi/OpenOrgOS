import { z } from "zod";
import { isoDate } from "./iso-date.js";

export const visaAsOfDate = isoDate;
const employeeId = z.string().regex(/^EMP-\d{3,}$/);
const catalogCode = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const workAllowance = z.enum(["unrestricted", "restricted_to_activity", "not_allowed"]);

/** 包括許可（施行規則19条5項1号）· 個別許可（同項3号） */
export const permissionScope = z.enum(["comprehensive", "individual"]);

export const permissionToEngageSchema = z
  .object({
    granted: z.boolean(),
    scope: permissionScope.default("comprehensive"),
    weekly_limit_hours: z.number().positive().optional(),
    granted_on: isoDate.optional(),
  })
  .strict();

/**
 * L2 data minimization: `.strict()` rejects any extra key (在留カード番号 · 旅券番号 ·
 * 国籍 · 住所 · 氏名等). Workers are referenced by `employee_id` only.
 */
export const foreignWorkerSchema = z
  .object({
    employee_id: employeeId,
    status_of_residence: catalogCode,
    period_expires_on: isoDate.optional(),
    card_valid_until: isoDate.optional(),
    card_verified_on: isoDate.optional(),
    card_verified_by: employeeId.optional(),
    renewal_application_filed_on: isoDate.optional(),
    permission_to_engage: permissionToEngageSchema.default({ granted: false }),
    job_category: catalogCode,
    hired_on: isoDate,
    separated_on: isoDate.optional(),
    employment_insurance_insured: z.boolean(),
    hello_work_hire_notified_on: isoDate.optional(),
    hello_work_separation_notified_on: isoDate.optional(),
  })
  .strict();

export const foreignWorkersFileSchema = z
  .object({
    as_of: isoDate.optional(),
    workers: z.array(foreignWorkerSchema),
  })
  .strict();

export const weeklyHoursRecordSchema = z
  .object({
    employee_id: employeeId,
    week_start: isoDate,
    hours: z.number().min(0),
    is_school_long_vacation: z.boolean().default(false),
    max_daily_hours: z.number().min(0).max(24).optional(),
    /** 他の就労先の時間（本人申告）— 資格外活動の上限は全就労先の合算 */
    other_employer_hours: z.number().min(0).optional(),
  })
  .strict();

export const weeklyHoursFileSchema = z
  .object({
    as_of: isoDate.optional(),
    weeks: z.array(weeklyHoursRecordSchema),
  })
  .strict();

export const jobCategorySchema = z
  .object({
    id: catalogCode,
    label_ja: z.string().min(1),
    /** 風営法2条の営業所等での業務 — 資格外活動許可では従事不可（施行規則19条5項1号） */
    fueiho_regulated: z.boolean().default(false),
  })
  .strict();

export const statusCatalogEntrySchema = z
  .object({
    code: catalogCode,
    name_ja: z.string().min(1),
    legal_basis: z.string().min(1),
    work_allowed: workAllowance,
    permitted_job_categories: z.array(catalogCode).default([]),
    excluded_job_categories: z.array(catalogCode).default([]),
    notes: z.string().optional(),
  })
  .strict();

export const statusCatalogFileSchema = z
  .object({
    as_of: isoDate.optional(),
    job_categories: z.array(jobCategorySchema),
    statuses: z.array(statusCatalogEntrySchema),
  })
  .strict();

export const visaSourcesFileSchema = z
  .object({
    sources: z.array(
      z
        .object({
          id: z.string().min(1),
          title: z.string().min(1),
          publisher: z.string().min(1),
          url: z.string().url(),
          type: z.enum(["law", "guide", "form", "tool"]),
          articles: z.array(z.string()).default([]),
          retrieved_on: isoDate,
          notes: z.string().optional(),
        })
        .strict()
    ),
  })
  .strict();

export type WorkAllowance = z.infer<typeof workAllowance>;
export type PermissionToEngage = z.output<typeof permissionToEngageSchema>;
export type ForeignWorker = z.output<typeof foreignWorkerSchema>;
export type ForeignWorkersFile = z.output<typeof foreignWorkersFileSchema>;
export type WeeklyHoursRecord = z.output<typeof weeklyHoursRecordSchema>;
export type WeeklyHoursFile = z.output<typeof weeklyHoursFileSchema>;
export type JobCategory = z.output<typeof jobCategorySchema>;
export type StatusCatalogEntry = z.output<typeof statusCatalogEntrySchema>;
export type StatusCatalogFile = z.output<typeof statusCatalogFileSchema>;
export type VisaSourcesFile = z.output<typeof visaSourcesFileSchema>;
