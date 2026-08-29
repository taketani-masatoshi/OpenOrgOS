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
  "send_clarify",
  "send_proposal",
  "send_reminder",
  "send_confirmation",
  "ceo_confirm",
  "write_calendar",
  "none",
]);

export const schedulingVenueOptionSchema = z.object({
  id: z.enum(["A", "B", "C"]),
  name: z.string().min(1),
  facts: z.string().optional(),
  first_pick: z.boolean().default(false),
});

export const schedulingLiveProofSchema = z.object({
  /** 相手区分 — self=自社mailbox往復 / external=社外コンタクト */
  partner: z.enum(["self", "external"]),
  /** 受理経路 — inject / eml_file（手元EML） / imap（受信ポーリング） */
  accept_path: z.enum(["inject", "imap", "eml_file", "unknown"]).default("unknown"),
  /** 予約番号の種別 — provider=本番 / measurement=計測・証明用（デモ） */
  venue_ref_kind: z.enum(["provider", "measurement"]),
  recorded_at: z.string().optional(),
  note: z.string().optional(),
});

export const schedulingQualitySignalsSchema = z.object({
  /** 承認前に下書き本文が CEO/秘書により編集された回数（自動） */
  ceo_draft_edits: z.number().int().nonnegative().default(0),
  /** チャット/メールでの言い回し指摘（手動記録 · Secretary KPI のみ） */
  ceo_tone_corrections: z.number().int().nonnegative().default(0),
  /** 送信時に style-lint を通過した回数（email · scheduling） */
  style_lint_pass_count: z.number().int().nonnegative().default(0),
  /** 直近送信時の style-lint warning 件数（error は送信不可のため 0） */
  last_style_lint_warnings: z.number().int().nonnegative().optional(),
  last_style_lint_at: z.string().optional(),
  /** ライブ証明の正本メモ（自己往復・inject を本番扱いにしない） */
  live_proof: schedulingLiveProofSchema.optional(),
  notes: z.array(z.string()).default([]),
});

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
  kind: z.enum(["clarify", "proposal", "reminder", "confirm"]),
  participant_id: z.string(),
  proposal_revision: z.number().int().nonnegative(),
  draft_id: z.string(),
  drafted_at: z.string(),
  sent_at: z.string().optional(),
  sent_mail_id: z.string().optional(),
  /** 起案時 body の sha256（品格 KPI · Secretary） */
  body_hash_at_draft: z.string().optional(),
});

export const schedulingProposalSendAuthoritySchema = z.object({
  operator_id: z.string().min(1),
  approver_name: z.string().min(1),
  covers_up_to_revision: z.number().int().nonnegative(),
});

export const schedulingLifecycleEventSchema = z.object({
  stage: z.enum(["created", "proposal_sent", "confirmed", "notification_sent", "cancelled", "rescheduled"]),
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
  /** 対面 clarify 用エリア（候補日提示前） */
  venue_area: z.string().optional(),
  /** CEO 確認済み会場3案（候補日提示前の clarify メール用） */
  venue_options: z.array(schedulingVenueOptionSchema).default([]),
  /** 会食費用目安（CEO 確認済み · 任意） */
  cost_estimate: z.string().optional(),
  /** Secretary 文案品格 KPI（Venue Booking KPI とは分離） */
  quality_signals: schedulingQualitySignalsSchema.optional(),
  /** 打合せ趣旨（CEO 確認済みであること）— 「定例」等のラベルを秘書が勝手に付けない */
  purpose: z.string().max(400).optional(),
  /**
   * 起票時の CEO 趣旨・形式確認が完了したか。
   * 既存案件互換のため default true。新規で未確認のときだけ false を明示する。
   */
  ceo_intake_confirmed: z.boolean().default(true),
  /** 相手返信から推定した希望形式（CEO 判断待ち） */
  suggested_meeting_format: z.enum(["online", "in_person", "unspecified"]).optional(),
  /** 曖昧返信 — Secretary Agent 補助が必要（CLI だけでは進めない） */
  agent_assist_needed: z.boolean().default(false),
  /** Venue booking ledger ref (VR-YYYY-NNN) — channel: venue_booking, not Wire */
  venue_reservation_id: z.string().regex(/^VR-\d{4}-\d{3}$/).optional(),
  /** Provider id from venue_booking adapters */
  venue_provider: z.string().optional(),
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
  /**
   * CEO が初回候補送付を承認した後の委任送信権限。
   * counter / 形式変更後は無効（再提案は都度 CEO 確認）。
   */
  proposal_send_authority: schedulingProposalSendAuthoritySchema.optional(),
  revision: z.number().int().nonnegative().default(0),
  source: z.enum(["cli", "chat"]).default("cli"),
  /** Optional link to sales deal (e.g. product demo) */
  deal_id: z.string().regex(/^DEAL-\d{4}-\d{3}$/).optional(),
  kind: z.enum(["general", "sales_demo"]).default("general"),
  notes: z.string().optional(),
  next_action: schedulingNextActionSchema.default("propose_slots"),
});

export const schedulingCasesFileSchema = z.object({
  version: z.literal(1).default(1),
  cases: z.array(schedulingCaseSchema).default([]),
});

export type SchedulingCaseStatus = z.output<typeof schedulingCaseStatusSchema>;
export type SchedulingParticipantResponse = z.output<
  typeof schedulingParticipantResponseSchema
>;
export type SchedulingParticipant = z.output<typeof schedulingParticipantSchema>;
export type SchedulingProposedSlot = z.output<typeof schedulingProposedSlotSchema>;
export type SchedulingCase = z.output<typeof schedulingCaseSchema>;
export type SchedulingCaseInput = z.input<typeof schedulingCaseSchema>;
export type SchedulingCasesFile = z.output<typeof schedulingCasesFileSchema>;
export type SchedulingProposalSendAuthority = z.output<
  typeof schedulingProposalSendAuthoritySchema
>;
export type SchedulingLiveProof = z.output<typeof schedulingLiveProofSchema>;
export type SchedulingQualitySignals = z.output<typeof schedulingQualitySignalsSchema>;
export type SchedulingNextAction = z.output<typeof schedulingNextActionSchema>;
