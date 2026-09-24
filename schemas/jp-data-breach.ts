import { z } from "zod";
import { isoDate } from "./iso-date.js";

export const breachAsOfDate = isoDate;

/** 事実フラグ — 未確認は "unknown"（needs_review として扱い、黙って false にしない） */
export const breachFactFlag = z.union([z.boolean(), z.literal("unknown")]);

export const breachIncidentStatus = z.enum([
  "investigating",
  "reported_preliminary",
  "reported_final",
  "closed",
  "not_reportable",
]);

/**
 * 漏えい等の対象 — personal_data: 既存の個人データ / being_acquired: 取得しようとしている個人情報
 * （施行規則7条3号括弧書 · 2024-04-01 施行）/ both: 両方
 */
export const breachDataScope = z.enum(["personal_data", "being_acquired", "both"]);

export const breachReportRecipient = z.enum(["ppc", "delegated_minister", "undetermined"]);

export const breachReportKind = z.enum(["preliminary", "final"]);

export const breachFlagsSchema = z.object({
  sensitive: breachFactFlag,
  financial_harm_risk: breachFactFlag,
  unlawful_purpose: breachFactFlag,
  encrypted_high_level: breachFactFlag,
  encryption_key_compromised: breachFactFlag.optional(),
});

export const breachNotificationAlternativeSchema = z.object({
  kind: z.enum(["public_announcement", "inquiry_desk", "other"]),
  implemented_on: isoDate,
  reason: z.string().min(1),
});

export const breachReportsSchema = z.object({
  preliminary_submitted_on: isoDate.optional(),
  final_submitted_on: isoDate.optional(),
});

/** 施行規則8条1項各号の記載素材（L2 相当 · テナントでは gitignore 推奨） */
export const breachReportItemsSchema = z.object({
  summary: z.string().optional(),
  medium: z.string().optional(),
  cause: z.string().optional(),
  secondary_damage: z.string().optional(),
  individual_response: z.string().optional(),
  publication: z.string().optional(),
  prevention_done: z.array(z.string().min(1)).default([]),
  prevention_planned: z.array(z.string().min(1)).default([]),
  other_notes: z.string().optional(),
});

export const breachIncidentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  occurred_on: isoDate.optional(),
  known_on: isoDate,
  discovered_by: z.string().min(1),
  data_scope: breachDataScope.default("personal_data"),
  intended_for_database: z.boolean().optional(),
  data_items: z.array(z.string().min(1)).min(1),
  data_subject_categories: z.array(z.string().min(1)).default([]),
  flags: breachFlagsSchema,
  affected_count: z.union([z.number().int().nonnegative(), z.literal("unknown")]),
  affected_count_upper_bound: z.number().int().nonnegative().optional(),
  is_entrustee: z.boolean().default(false),
  entrustor_ref: z.string().optional(),
  entrustor_notified_on: isoDate.optional(),
  report_recipient: breachReportRecipient.default("undetermined"),
  reports: breachReportsSchema.default({}),
  individuals_notified_on: isoDate.optional(),
  notification_alternative: breachNotificationAlternativeSchema.optional(),
  status: breachIncidentStatus.default("investigating"),
  report_items: breachReportItemsSchema.optional(),
  notes: z.string().optional(),
});

export const breachIncidentsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  incidents: z.array(breachIncidentSchema),
});

export const breachHolidaysFileSchema = z.object({
  source_url: z.string().url(),
  retrieved_on: isoDate,
  holidays: z.array(isoDate),
});

export const breachSourcesFileSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
      type: z.enum(["law", "regulation", "guideline", "form", "guide", "calendar"]),
      articles: z.array(z.string()).default([]),
      retrieved_on: isoDate,
      notes: z.string().optional(),
    })
  ),
  forms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: breachReportKind,
      template: z.string(),
      legal_basis: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export type BreachFactFlag = z.infer<typeof breachFactFlag>;
export type BreachFlags = z.output<typeof breachFlagsSchema>;
export type BreachReportKind = z.infer<typeof breachReportKind>;
export type BreachIncident = z.output<typeof breachIncidentSchema>;
export type BreachIncidentsFile = z.output<typeof breachIncidentsFileSchema>;
export type BreachHolidaysFile = z.output<typeof breachHolidaysFileSchema>;
export type BreachSourcesFile = z.output<typeof breachSourcesFileSchema>;
