import { z } from "zod";
import { dateString } from "../common.js";
import { datetimeString } from "../executive.js";

export const schedulingCaseStatusSchema = z.enum([
  "open",
  "proposing",
  "awaiting_responses",
  "awaiting_ceo",
  "confirmed",
  "notifying",
  "closed",
  "needs_review",
  "cancelled",
]);

export const schedulingParticipantRoleSchema = z.enum(["internal", "external"]);

export const schedulingParticipantResponseSchema = z.enum([
  "pending",
  "accept",
  "decline",
  "counter",
  "unknown",
]);

export const schedulingNextActionSchema = z.enum([
  "propose_slots",
  "send_proposal",
  "send_reminder",
  "send_confirmation",
  "ceo_confirm",
  "write_calendar",
  "none",
]);

export const schedulingCalendarSyncSchema = z.enum([
  "not_requested",
  "pending",
  "syncing",
  "synced",
  "failed",
]);

export const schedulingParticipantSchema = z.object({
  id: z.string().regex(/^PART-\d{3}$/),
  name: z.string().min(1),
  email: z.string().optional(),
  contact_ref: z.string().optional(),
  role: schedulingParticipantRoleSchema.default("external"),
  response: schedulingParticipantResponseSchema.default("pending"),
  accepted_slot_id: z.string().optional(),
  response_note: z.string().optional(),
  responded_at: z.string().optional(),
  responded_mail_id: z.string().optional(),
});

export const schedulingProposedSlotSchema = z.object({
  id: z.string().regex(/^SLOT-\d{3}$/),
  start: datetimeString,
  end: datetimeString,
  label: z.string().optional(),
});

export const schedulingReminderRecordSchema = z.object({
  proposal_revision: z.number().int().nonnegative(),
  participant_id: z.string(),
  drafted_at: z.string(),
  draft_id: z.string().optional(),
});

export const schedulingCorrespondenceRecordSchema = z.object({
  kind: z.enum(["proposal", "reminder", "confirm"]),
  participant_id: z.string(),
  proposal_revision: z.number().int().nonnegative(),
  draft_id: z.string(),
  drafted_at: z.string(),
  sent_at: z.string().optional(),
  sent_mail_id: z.string().optional(),
});

export const schedulingProposalSendAuthoritySchema = z.object({
  operator_id: z.string().min(1),
  approver_name: z.string().min(1),
  covers_up_to_revision: z.number().int().nonnegative(),
});

export const schedulingLifecycleEventSchema = z.object({
  stage: z.enum([
    "created",
    "proposal_sent",
    "confirmed",
    "notification_sent",
    "cancelled",
    "rescheduled",
  ]),
  proposal_revision: z.number().int().nonnegative().default(0),
  event_id: z.string(),
  recorded_at: z.string(),
});

export const schedulingCaseSchema = z.object({
  id: z.string().regex(/^SCH-\d{4}-\d{3}$/),
  title: z.string().min(1),
  status: schedulingCaseStatusSchema.default("open"),
  created_at: z.string(),
  updated_at: z.string(),
  participants: z.array(schedulingParticipantSchema).min(1),
  proposed_slots: z.array(schedulingProposedSlotSchema).default([]),
  duration_minutes: z.number().int().positive().default(60),
  search_from: dateString.optional(),
  search_to: dateString.optional(),
  mail_thread_ids: z.array(z.string()).default([]),
  processed_mail_ids: z.array(z.string()).default([]),
  linked_event_id: z.string().optional(),
  calendar_sync: schedulingCalendarSyncSchema.default("not_requested"),
  calendar_sync_error: z.string().optional(),
  calendar_synced_at: z.string().optional(),
  ceo_question_id: z.string().optional(),
  pending_slot_id: z.string().optional(),
  meeting_format: z.enum(["online", "in_person", "unspecified"]).default("unspecified"),
  location: z.string().optional(),
  counter_round: z.number().int().nonnegative().default(0),
  /** Revision of the candidate set, separate from optimistic-lock revision. */
  proposal_revision: z.number().int().nonnegative().default(0),
  reminder_due_at: z.string().optional(),
  reminder_targets: z.array(z.string()).default([]),
  reminder_history: z.array(schedulingReminderRecordSchema).default([]),
  correspondence: z.array(schedulingCorrespondenceRecordSchema).default([]),
  lifecycle_events: z.array(schedulingLifecycleEventSchema).default([]),
  last_draft_id: z.string().optional(),
  last_sent_mail_id: z.string().optional(),
  exception_reason: z.string().optional(),
  /** CEO が初回候補送付を承認した後、counter 再提案を同一権限で自動送信する */
  proposal_send_authority: schedulingProposalSendAuthoritySchema.optional(),
  revision: z.number().int().nonnegative().default(0),
  source: z.enum(["cli", "chat"]).default("cli"),
  notes: z.string().optional(),
  next_action: schedulingNextActionSchema.default("propose_slots"),
});

export const schedulingCasesFileSchema = z.object({
  version: z.literal(1).default(1),
  cases: z.array(schedulingCaseSchema).default([]),
});

export type SchedulingCaseStatus = z.output<typeof schedulingCaseStatusSchema>;
export type SchedulingParticipantResponse = z.output<typeof schedulingParticipantResponseSchema>;
export type SchedulingParticipant = z.output<typeof schedulingParticipantSchema>;
export type SchedulingProposedSlot = z.output<typeof schedulingProposedSlotSchema>;
export type SchedulingCase = z.output<typeof schedulingCaseSchema>;
export type SchedulingCaseInput = z.input<typeof schedulingCaseSchema>;
export type SchedulingCasesFile = z.output<typeof schedulingCasesFileSchema>;
export type SchedulingProposalSendAuthority = z.output<
  typeof schedulingProposalSendAuthoritySchema
>;
export type SchedulingNextAction = z.output<typeof schedulingNextActionSchema>;
