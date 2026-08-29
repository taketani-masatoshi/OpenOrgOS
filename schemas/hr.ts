import { z } from "zod";
import { dateString } from "./common.js";

export const employeeStatus = z.enum(["active", "inactive", "leave"]);

export const employmentType = z.enum([
  "full_time",
  "part_time",
  "contractor",
  "other",
]);

export const employeeSchema = z.object({
  id: z.string().regex(/^EMP-\d{3,}$/),
  name: z.string().min(1),
  hired_date: dateString.nullable().optional(),
  job_type: z.string().nullable().optional(),
  /** Attention Canvas 用（任意）· 個人名は投影しない */
  employment_type: employmentType.optional(),
  /** 雇用終了予定（任意）· 欠落は推測埋めしない */
  end_date: dateString.optional(),
  status: employeeStatus.default("inactive"),
  contract_id: z.string().regex(/^CTR-\d{3,}$/).optional(),
});

export const employeesFileSchema = z.object({
  employees: z.array(employeeSchema).default([]),
  notes: z.string().optional(),
});

export type Employee = z.output<typeof employeeSchema>;
export type EmployeesFile = z.output<typeof employeesFileSchema>;

/**
 * Competence level. ISO 21401:2018 7.2 requires the organisation to determine
 * the necessary competence and to evaluate whether it is met; the numeric scale
 * exists so the gap is computed rather than asserted in prose.
 *
 * 0 未習得 · 1 知識あり（補助が要る） · 2 単独で遂行できる · 3 指導・改善ができる
 */
export const competenceLevel = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const competenceRoleSchema = z.object({
  id: z.string().regex(/^ROLE-[A-Z0-9-]+$/),
  title: z.string().min(1),
  /** Org chart node this role maps to, when one exists. */
  org_node: z.string().optional(),
  members: z.array(z.string().regex(/^EMP-\d{3,}$/)).default([]),
});

export const competenceItemSchema = z.object({
  id: z.string().regex(/^CMP-\d{2,}$/),
  title: z.string().min(1),
  /** Why this competence is required — clause and/or internal regulation. */
  iso_clause: z.string().optional(),
  reg_refs: z.array(z.string()).default([]),
  statutory: z.boolean().default(false),
  /** Required level per role id. Roles omitted here need no competence. */
  required: z.record(z.string(), competenceLevel).default({}),
});

export const competenceAssessmentSchema = z.object({
  employee_id: z.string().regex(/^EMP-\d{3,}$/),
  competence_id: z.string().regex(/^CMP-\d{2,}$/),
  level: competenceLevel,
  assessed_on: dateString,
  /** Evidence the level rests on — experience, qualification, training id. */
  basis: z.string().min(1),
});

export const competenceFileSchema = z.object({
  version: z.string().default("1"),
  standard: z.string().optional(),
  as_of: dateString,
  notes: z.string().optional(),
  roles: z.array(competenceRoleSchema).default([]),
  competences: z.array(competenceItemSchema).default([]),
  assessments: z.array(competenceAssessmentSchema).default([]),
});

export const trainingSessionSchema = z.object({
  id: z.string().regex(/^TRN-\d{3,}$/),
  title: z.string().min(1),
  /** Competences this session is designed to raise. */
  competence_ids: z.array(z.string().regex(/^CMP-\d{2,}$/)).min(1),
  method: z.enum(["self_study", "ojt", "workshop", "external", "drill"]),
  duration_min: z.number().int().positive(),
  planned_on: dateString,
  audience: z.array(z.string().regex(/^EMP-\d{3,}$/)).min(1),
  /** Course material backing the session. */
  material: z.string().optional(),
  /** How effectiveness is judged (ISO 21401 7.2 d). */
  evaluation: z.string().min(1),
});

export const trainingRecordSchema = z.object({
  session_id: z.string().regex(/^TRN-\d{3,}$/),
  employee_id: z.string().regex(/^EMP-\d{3,}$/),
  held_on: dateString,
  /** Outcome of the effectiveness check, not mere attendance. */
  result: z.enum(["effective", "partial", "not_effective"]),
  assessed_level: competenceLevel.optional(),
  notes: z.string().optional(),
});

export const trainingFileSchema = z.object({
  version: z.string().default("1"),
  fiscal_year: z.string().min(4),
  notes: z.string().optional(),
  sessions: z.array(trainingSessionSchema).default([]),
  records: z.array(trainingRecordSchema).default([]),
});

export type CompetenceLevel = z.output<typeof competenceLevel>;
export type CompetenceRole = z.output<typeof competenceRoleSchema>;
export type CompetenceItem = z.output<typeof competenceItemSchema>;
export type CompetenceAssessment = z.output<typeof competenceAssessmentSchema>;
export type CompetenceFile = z.output<typeof competenceFileSchema>;
export type TrainingSession = z.output<typeof trainingSessionSchema>;
export type TrainingRecord = z.output<typeof trainingRecordSchema>;
export type TrainingFile = z.output<typeof trainingFileSchema>;
