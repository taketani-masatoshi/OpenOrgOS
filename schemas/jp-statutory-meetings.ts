import { z } from "zod";
import { isoDate } from "./iso-date.js";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const count = z.number().int().nonnegative();

export const statutoryRatioSchema = z.object({
  numerator: z.number().int().positive(),
  denominator: z.number().int().positive(),
});

export const shareholderSessionSchema = z.enum(["annual", "extraordinary"]);
export const meetingModeSchema = z.enum(["convened", "written_resolution"]);
export const noticeMethodSchema = z.enum(["written", "electronic", "oral"]);
export const minutesMediumSchema = z.enum(["paper", "electronic"]);

/** ordinary=309(1) · director_election=341 · special=309(2) · special_309_3=309(3) · special_309_4=309(4) · board=369(1) */
export const resolutionTypeSchema = z.enum([
  "ordinary",
  "director_election",
  "special",
  "special_309_3",
  "special_309_4",
  "board",
]);

export const officerRoleSchema = z.enum([
  "representative_director",
  "director",
  "outside_director",
  "auditor",
  "accounting_advisor",
]);

export const governanceSettingsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  company_profile: z.object({
    is_public_company: z.boolean(),
    has_board: z.boolean(),
    has_auditor: z.boolean().default(false),
    has_branches: z.boolean().default(false),
    uses_electronic_provision: z.boolean().default(false),
    voting_shareholders_count: count.optional(),
  }),
  articles: z
    .object({
      shareholders_notice_days: count.optional(),
      board_notice_days: count.optional(),
      allow_board_written_resolution: z.boolean().default(false),
      ordinary_quorum_excluded: z.boolean().default(false),
      special_quorum: statutoryRatioSchema.optional(),
      election_quorum: statutoryRatioSchema.optional(),
      annual_meeting_within_months: z.number().int().positive().optional(),
      heightened_requirements: z.boolean().default(false),
    })
    .default({}),
  officers: z
    .array(
      z.object({
        stakeholder_id: z.string().min(1),
        role: officerRoleSchema,
        display_name: z.string().optional(),
      })
    )
    .default([]),
});

export const resolutionVotesSchema = z.object({
  voting_rights_total: count.optional(),
  voting_rights_present: count.optional(),
  voting_rights_for: count.optional(),
  shareholders_total: count.optional(),
  shareholders_for: count.optional(),
  directors_eligible: count.optional(),
  directors_present: count.optional(),
  directors_for: count.optional(),
});

export const statutoryResolutionSchema = z.object({
  id: z.string().min(1),
  agenda: z.string().min(1),
  type: resolutionTypeSchema,
  proposer_stakeholder_id: z.string().optional(),
  votes: resolutionVotesSchema.optional(),
  outcome_recorded: z.enum(["approved", "rejected"]).optional(),
});

export const consentRecordSchema = z.object({
  eligible: count,
  consented: count,
  completed_on: isoDate.optional(),
});

export const minutesRecordSchema = z.object({
  status: z.enum(["not_started", "drafted", "finalized"]).default("not_started"),
  medium: minutesMediumSchema.default("paper"),
  prepared_on: isoDate.optional(),
  author_stakeholder_id: z.string().optional(),
  chair_stakeholder_id: z.string().optional(),
  recorded_items: z.array(z.string().min(1)).default([]),
  conditional_items_applicable: z.array(z.string().min(1)).optional(),
  kept_at_head_office: z.boolean().default(false),
  branch_copy_kept: z.boolean().default(false),
  branch_access_measures: z.boolean().default(false),
});

export const statutoryMeetingSchema = z.object({
  meeting_id: z.string().min(1),
  title: z.string().min(1),
  session: shareholderSessionSchema.optional(),
  mode: meetingModeSchema.default("convened"),
  start_time: hhmm.optional(),
  place: z.string().optional(),
  fiscal_year_end: isoDate.optional(),
  record_date: isoDate.optional(),
  record_date_in_articles: z.boolean().default(false),
  record_date_notice_on: isoDate.optional(),
  written_voting: z.boolean().default(false),
  electronic_voting: z.boolean().default(false),
  notice_sent_on: isoDate.optional(),
  notice_method: noticeMethodSchema.optional(),
  electronic_notice_consent: z.boolean().default(false),
  convocation_omission: consentRecordSchema.optional(),
  written_consent: consentRecordSchema.optional(),
  auditor_objection: z.boolean().default(false),
  consent_documents_kept: z.boolean().default(false),
  attendee_stakeholder_ids: z.array(z.string().min(1)).default([]),
  resolutions: z.array(statutoryResolutionSchema).default([]),
  minutes: minutesRecordSchema.optional(),
  docs_root: z.string().optional(),
  notes: z.string().optional(),
});

export const statutoryMeetingsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  meetings: z.array(statutoryMeetingSchema).default([]),
});

export const statutoryMeetingsSourcesFileSchema = z.object({
  retrieved_on: isoDate,
  sources: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      url: z.string().url(),
      articles: z.array(z.string()).default([]),
      retrieved_on: isoDate.optional(),
      notes: z.string().optional(),
    })
  ),
  templates: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        template: z.string().min(1),
        legal_basis: z.string().optional(),
      })
    )
    .default([]),
});

export type StatutoryRatio = z.output<typeof statutoryRatioSchema>;
export type ShareholderSession = z.output<typeof shareholderSessionSchema>;
export type MeetingMode = z.output<typeof meetingModeSchema>;
export type NoticeMethod = z.output<typeof noticeMethodSchema>;
export type ResolutionType = z.output<typeof resolutionTypeSchema>;
export type GovernanceSettingsFile = z.output<typeof governanceSettingsFileSchema>;
export type CompanyGovernanceProfile = GovernanceSettingsFile["company_profile"];
export type ArticlesOfIncorporationRules = GovernanceSettingsFile["articles"];
export type ResolutionVotes = z.output<typeof resolutionVotesSchema>;
export type StatutoryResolution = z.output<typeof statutoryResolutionSchema>;
export type ConsentRecord = z.output<typeof consentRecordSchema>;
export type MinutesRecord = z.output<typeof minutesRecordSchema>;
export type StatutoryMeeting = z.output<typeof statutoryMeetingSchema>;
export type StatutoryMeetingsFile = z.output<typeof statutoryMeetingsFileSchema>;
export type StatutoryMeetingsSourcesFile = z.output<typeof statutoryMeetingsSourcesFileSchema>;
