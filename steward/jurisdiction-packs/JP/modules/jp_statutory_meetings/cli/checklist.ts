import type { GovernanceSettingsFile, StatutoryMeeting } from "../../../../../../schemas/jp-statutory-meetings.js";
import { daysBetween } from "../../../../../../src/lib/utils.js";
import {
  addDays,
  boardOmissionPaths,
  checkMandatoryWrittenVoting,
  checkMinutesItems,
  checkNoticeMethod,
  checkNoticeTiming,
  checkRetention,
  ELECTRONIC_PROVISION_LEAD_DAYS,
  evaluateResolution,
  isUnanimous,
  latestDispatchDate,
  minutesItemSet,
  minutesRetentionPlan,
  periodEndAfterMonths,
  recordDateWindow,
  resolveBoardNoticePeriod,
  resolveShareholderNoticePeriod,
  shareholderOmissionPaths,
  type CheckItem,
  type CheckStatus,
  type MeetingBody,
  type NoticePeriod,
  type OmissionPath,
  type RecordDateWindow,
} from "./rules.js";

export const JP_JURISDICTION = "JP";

export interface MeetingContext {
  meetingId: string;
  body: MeetingBody;
  meetingDate: string;
  held: boolean;
  statutory: StatutoryMeeting;
  settings: GovernanceSettingsFile;
}

export function jurisdictionCheck(code: string): CheckItem {
  const ok = code === JP_JURISDICTION;
  return {
    id: "req-jp",
    label: "日本法域テナントであること",
    status: ok ? "ok" : "issue",
    detail: ok ? JP_JURISDICTION : `current: ${code}`,
    basis: "会社法（日本法）",
  };
}

export function noticePeriodFor(ctx: MeetingContext): NoticePeriod {
  const { company_profile: profile, articles } = ctx.settings;
  return ctx.body === "shareholders"
    ? resolveShareholderNoticePeriod(profile, articles, ctx.statutory)
    : resolveBoardNoticePeriod(articles);
}

export function omissionPathsFor(ctx: MeetingContext): OmissionPath[] {
  const { company_profile: profile, articles } = ctx.settings;
  return ctx.body === "shareholders"
    ? shareholderOmissionPaths(ctx.statutory)
    : boardOmissionPaths(ctx.statutory, profile, articles);
}

// ---------------------------------------------------------------------------
// schedule
// ---------------------------------------------------------------------------

export interface MeetingSchedule {
  meeting_id: string;
  body: MeetingBody;
  mode: StatutoryMeeting["mode"];
  meeting_date: string;
  as_of: string;
  days_until_meeting: number;
  notice: {
    days: number;
    latest_dispatch_date: string;
    days_remaining: number;
    written_required: boolean;
    sent_on: string | null;
    basis: string;
  } | null;
  record_date: (RecordDateWindow & { days_remaining_to_window_end: number }) | null;
  electronic_provision_start: string | null;
  omission_paths: OmissionPath[];
  needs_review: string[];
}

function scheduleNotice(ctx: MeetingContext, asOf: string): MeetingSchedule["notice"] {
  if (ctx.statutory.mode === "written_resolution") return null;
  const period = noticePeriodFor(ctx);
  const deadline = latestDispatchDate(ctx.meetingDate, period.days);
  return {
    days: period.days,
    latest_dispatch_date: deadline,
    days_remaining: daysBetween(asOf, deadline),
    written_required: period.writtenRequired,
    sent_on: ctx.statutory.notice_sent_on ?? null,
    basis: period.basis,
  };
}

function scheduleRecordDate(ctx: MeetingContext, asOf: string): MeetingSchedule["record_date"] {
  const recordDate = ctx.statutory.record_date;
  if (ctx.body !== "shareholders" || !recordDate) return null;
  const window = recordDateWindow(recordDate, ctx.meetingDate, ctx.statutory.record_date_in_articles);
  return { ...window, days_remaining_to_window_end: daysBetween(asOf, window.window_end) };
}

function electronicProvisionStart(ctx: MeetingContext): string | null {
  if (ctx.body !== "shareholders" || !ctx.settings.company_profile.uses_electronic_provision) return null;
  const threeWeeksBefore = addDays(ctx.meetingDate, -ELECTRONIC_PROVISION_LEAD_DAYS);
  const sentOn = ctx.statutory.notice_sent_on;
  return sentOn && sentOn < threeWeeksBefore ? sentOn : threeWeeksBefore;
}

function scheduleReviewNotes(ctx: MeetingContext): string[] {
  const notes: string[] = [];
  if (ctx.body === "board" && !ctx.settings.company_profile.has_board) {
    notes.push("取締役会非設置会社 — 取締役会の手続は適用されない（会社法326条2項）");
  }
  if (electronicProvisionStart(ctx)) {
    notes.push("電子提供措置（会社法325条の2以下）の詳細は人間確認 · 上場会社の実務は対象外");
  }
  if (ctx.settings.articles.heightened_requirements) {
    notes.push("定款で加重・変更された要件あり — 定款原本で確認");
  }
  return notes;
}

export function buildMeetingSchedule(ctx: MeetingContext, asOf: string): MeetingSchedule {
  return {
    meeting_id: ctx.meetingId,
    body: ctx.body,
    mode: ctx.statutory.mode,
    meeting_date: ctx.meetingDate,
    as_of: asOf,
    days_until_meeting: daysBetween(asOf, ctx.meetingDate),
    notice: scheduleNotice(ctx, asOf),
    record_date: scheduleRecordDate(ctx, asOf),
    electronic_provision_start: electronicProvisionStart(ctx),
    omission_paths: omissionPathsFor(ctx),
    needs_review: scheduleReviewNotes(ctx),
  };
}

// ---------------------------------------------------------------------------
// checklist
// ---------------------------------------------------------------------------

export type ChecklistResult = "pass" | "issues" | "needs_review";

export interface MeetingChecklist {
  meeting_id: string;
  body: MeetingBody;
  mode: StatutoryMeeting["mode"];
  phase: "pre_meeting" | "post_meeting";
  result: ChecklistResult;
  passed: boolean;
  checks: CheckItem[];
}

function boardExistsCheck(ctx: MeetingContext): CheckItem {
  const ok = ctx.settings.company_profile.has_board;
  return {
    id: "board-exists",
    label: "取締役会設置会社であること",
    status: ok ? "ok" : "issue",
    detail: ok ? "has_board: true" : "取締役会非設置会社",
    basis: "会社法326条2項",
  };
}

function noticeChecks(ctx: MeetingContext, asOf: string): CheckItem[] {
  const omissionPath = omissionPathsFor(ctx)[0];
  if (omissionPath?.availability === "applied") {
    return [
      { id: "notice-omitted", label: "招集手続の省略", status: "ok", detail: "全員同意あり", basis: omissionPath.basis },
    ];
  }
  const period = noticePeriodFor(ctx);
  const timing = checkNoticeTiming({
    meetingDate: ctx.meetingDate,
    period,
    noticeSentOn: ctx.statutory.notice_sent_on,
    asOf,
  });
  return ctx.body === "shareholders" ? [timing, checkNoticeMethod(ctx.statutory, period)] : [timing];
}

function recordDateNoticeStatus(window: RecordDateWindow, noticeOn: string | undefined, asOf: string): CheckStatus {
  if (!window.public_notice_required || !window.public_notice_deadline) return "ok";
  if (noticeOn) return noticeOn <= window.public_notice_deadline ? "ok" : "issue";
  return asOf <= window.public_notice_deadline ? "needs_review" : "issue";
}

function recordDateChecks(ctx: MeetingContext, asOf: string): CheckItem[] {
  const recordDate = ctx.statutory.record_date;
  if (!recordDate) {
    return [{ id: "record-date", label: "基準日", status: "ok", detail: "基準日なし（会日時点の株主が議決権を行使）", basis: "会社法124条" }];
  }
  const window = recordDateWindow(recordDate, ctx.meetingDate, ctx.statutory.record_date_in_articles);
  const windowCheck: CheckItem = {
    id: "record-date-window",
    label: "基準日から3か月以内の開催",
    status: window.meeting_within_window ? "ok" : "issue",
    detail: `基準日 ${recordDate} · 期限 ${window.window_end} · 会日 ${ctx.meetingDate}`,
    basis: "会社法124条2項",
  };
  const noticeCheck: CheckItem = {
    id: "record-date-notice",
    label: "基準日公告（定款に定めがない場合）",
    status: recordDateNoticeStatus(window, ctx.statutory.record_date_notice_on, asOf),
    detail: window.public_notice_required
      ? `公告期限 ${window.public_notice_deadline} · 公告日 ${ctx.statutory.record_date_notice_on ?? "未記録"}`
      : "定款に基準日の定めあり",
    basis: "会社法124条3項",
  };
  return [windowCheck, noticeCheck];
}

function annualTimingCheck(ctx: MeetingContext): CheckItem {
  const base = { id: "annual-timing", label: "定時株主総会の開催時期", basis: "会社法296条1項" };
  const fiscalYearEnd = ctx.statutory.fiscal_year_end;
  if (!fiscalYearEnd || ctx.meetingDate <= fiscalYearEnd) {
    return { ...base, status: "issue", detail: "事業年度末日（fiscal_year_end）の後に開催する必要" };
  }
  const months = ctx.settings.articles.annual_meeting_within_months;
  if (months === undefined) {
    return { ...base, status: "needs_review", detail: "「一定の時期」— 定款の定めを確認" };
  }
  const limit = periodEndAfterMonths(fiscalYearEnd, months);
  return {
    ...base,
    status: ctx.meetingDate <= limit ? "ok" : "issue",
    detail: `事業年度末 ${fiscalYearEnd} · 定款上の期限 ${limit}`,
  };
}

function electronicProvisionCheck(ctx: MeetingContext): CheckItem[] {
  const start = electronicProvisionStart(ctx);
  if (!start) return [];
  return [
    {
      id: "electronic-provision",
      label: "電子提供措置",
      status: "needs_review",
      detail: `電子提供措置開始日 ${start} · 詳細は対象外（人間確認）`,
      basis: "会社法325条の3・325条の4",
    },
  ];
}

function shareholderPreMeetingChecks(ctx: MeetingContext, asOf: string): CheckItem[] {
  const checks = [...recordDateChecks(ctx, asOf), checkMandatoryWrittenVoting(ctx.statutory, ctx.settings.company_profile)];
  if (ctx.statutory.session === "annual") checks.push(annualTimingCheck(ctx));
  return [...checks, ...electronicProvisionCheck(ctx)];
}

function writtenConsentCheck(ctx: MeetingContext): CheckItem {
  const basis = ctx.body === "shareholders" ? "会社法319条1項" : "会社法370条";
  const base = { id: "written-consent", label: "決議の省略 — 全員の同意", basis };
  if (ctx.body === "board" && !ctx.settings.articles.allow_board_written_resolution) {
    return { ...base, status: "issue", detail: "定款に取締役会決議の省略の定めがない" };
  }
  if (ctx.body === "board" && ctx.statutory.auditor_objection) {
    return { ...base, status: "issue", detail: "監査役の異議あり" };
  }
  const consent = ctx.statutory.written_consent;
  if (!consent) return { ...base, status: "needs_review", detail: "同意の記録なし" };
  const ok = isUnanimous(consent);
  return { ...base, status: ok ? "ok" : "issue", detail: `同意 ${consent.consented}/${consent.eligible}` };
}

function consentRetentionCheck(ctx: MeetingContext): CheckItem {
  const kept = ctx.statutory.consent_documents_kept;
  return {
    id: "consent-retention",
    label: "同意書面・電磁的記録の本店備置（10年）",
    status: kept ? "ok" : "issue",
    detail: kept ? "備置記録あり" : "備置記録なし",
    basis: ctx.body === "shareholders" ? "会社法319条2項" : "会社法371条1項",
  };
}

function resolutionChecks(ctx: MeetingContext): CheckItem[] {
  return ctx.statutory.resolutions.map((resolution) => {
    const evaluation = evaluateResolution(resolution, ctx.settings.articles);
    return {
      id: `resolution:${resolution.id}`,
      label: `決議要件 — ${resolution.agenda}`,
      status: evaluation.status,
      detail: evaluation.detail,
      basis: evaluation.basis,
    };
  });
}

function minutesChecks(ctx: MeetingContext): CheckItem[] {
  const minutes = ctx.statutory.minutes;
  const plan = minutesRetentionPlan(ctx.body, ctx.meetingDate, ctx.settings.company_profile, minutes);
  return [checkMinutesItems(minutesItemSet(ctx.body, ctx.statutory.mode), minutes), checkRetention(ctx.body, plan, minutes)];
}

function preMeetingChecks(ctx: MeetingContext, asOf: string): CheckItem[] {
  if (ctx.statutory.mode === "written_resolution") return [writtenConsentCheck(ctx)];
  const notice = noticeChecks(ctx, asOf);
  return ctx.body === "shareholders" ? [...notice, ...shareholderPreMeetingChecks(ctx, asOf)] : notice;
}

function postMeetingChecks(ctx: MeetingContext): CheckItem[] {
  if (ctx.statutory.mode === "written_resolution") return [consentRetentionCheck(ctx), ...minutesChecks(ctx)];
  return [...resolutionChecks(ctx), ...minutesChecks(ctx)];
}

export function summarizeChecks(checks: CheckItem[]): ChecklistResult {
  if (checks.some((check) => check.status === "issue")) return "issues";
  if (checks.some((check) => check.status === "needs_review")) return "needs_review";
  return "pass";
}

export function buildMeetingChecklist(ctx: MeetingContext, jurisdictionCode: string, asOf: string): MeetingChecklist {
  const checks: CheckItem[] = [jurisdictionCheck(jurisdictionCode)];
  if (ctx.body === "board") checks.push(boardExistsCheck(ctx));
  checks.push(...preMeetingChecks(ctx, asOf));
  if (ctx.held) checks.push(...postMeetingChecks(ctx));
  const result = summarizeChecks(checks);
  return {
    meeting_id: ctx.meetingId,
    body: ctx.body,
    mode: ctx.statutory.mode,
    phase: ctx.held ? "post_meeting" : "pre_meeting",
    result,
    passed: result === "pass",
    checks,
  };
}
