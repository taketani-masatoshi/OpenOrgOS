import type {
  ArticlesOfIncorporationRules,
  CompanyGovernanceProfile,
  ConsentRecord,
  MinutesRecord,
  ResolutionType,
  ResolutionVotes,
  StatutoryMeeting,
  StatutoryRatio,
  StatutoryResolution,
} from "../../../../../../schemas/jp-statutory-meetings.js";
import { daysBetween } from "../../../../../../src/lib/utils.js";

export type MeetingBody = "shareholders" | "board";
export type CheckStatus = "ok" | "issue" | "needs_review";

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  basis: string;
}

/** 会社法299条1項 — 公開会社・書面/電磁的議決権行使を定めた場合 */
export const TWO_WEEK_NOTICE_DAYS = 14;
/** 会社法299条1項 — 公開会社でない株式会社 */
export const NON_PUBLIC_NOTICE_DAYS = 7;
/** 会社法368条1項 */
export const BOARD_NOTICE_DAYS = 7;
/** 会社法325条の3第1項 — 電子提供措置開始日は会日の3週間前の日 */
export const ELECTRONIC_PROVISION_LEAD_DAYS = 21;
/** 会社法124条2項 — 基準日から3か月以内に行使する権利に限る */
export const RECORD_DATE_WINDOW_MONTHS = 3;
/** 会社法124条3項 — 基準日の2週間前までに公告（定款に定めがある場合を除く） */
export const RECORD_DATE_NOTICE_DAYS = 14;
/** 会社法298条2項 — 議決権を有する株主1,000人以上は書面投票が義務 */
export const MANDATORY_WRITTEN_VOTING_SHAREHOLDERS = 1000;
/** 会社法318条2項・319条2項・371条1項 — 本店備置10年 */
export const HEAD_OFFICE_RETENTION_YEARS = 10;
/** 会社法318条3項 — 支店に写しを5年備置 */
export const BRANCH_COPY_RETENTION_YEARS = 5;

const MONTHS_PER_YEAR = 12;

/** 会社法309条1項・341条・369条1項「過半数」（超過） */
export const MAJORITY: StatutoryRatio = { numerator: 1, denominator: 2 };
/** 会社法309条3項・4項「半数以上」 */
export const HALF_OR_MORE: StatutoryRatio = { numerator: 1, denominator: 2 };
/** 会社法309条2項・341条 — 定款で緩和できる定足数の下限 */
export const MIN_ARTICLES_QUORUM: StatutoryRatio = { numerator: 1, denominator: 3 };
/** 会社法309条2項・3項 */
export const TWO_THIRDS: StatutoryRatio = { numerator: 2, denominator: 3 };
/** 会社法309条4項 */
export const THREE_QUARTERS: StatutoryRatio = { numerator: 3, denominator: 4 };

const SHAREHOLDER_BODY_KINDS = new Set(["shareholders", "shareholders_meeting"]);
const BOARD_BODY_KINDS = new Set(["board", "board_meeting"]);

export function resolveMeetingBody(kind: string): MeetingBody | null {
  if (SHAREHOLDER_BODY_KINDS.has(kind)) return "shareholders";
  if (BOARD_BODY_KINDS.has(kind)) return "board";
  return null;
}

// ---------------------------------------------------------------------------
// Date arithmetic (UTC · 民法140条 初日不算入 · 143条 暦による計算)
// ---------------------------------------------------------------------------

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** Last day of a period of `months` counted from the day after `fromIso` (民法140条・143条2項). */
export function periodEndAfterMonths(fromIso: string, months: number): string {
  const start = toUtc(addDays(fromIso, 1));
  const totalMonths = start.getUTCMonth() + months;
  const year = start.getUTCFullYear() + Math.floor(totalMonths / MONTHS_PER_YEAR);
  const monthIndex = totalMonths % MONTHS_PER_YEAR;
  const lastDay = daysInMonth(year, monthIndex);
  if (start.getUTCDate() > lastDay) {
    return toIso(new Date(Date.UTC(year, monthIndex, lastDay)));
  }
  return addDays(toIso(new Date(Date.UTC(year, monthIndex, start.getUTCDate()))), -1);
}

/**
 * Latest dispatch date for "会日の N 日（週）前までに通知を発する".
 * 発信日と会日を算入せず、その間に N 日を置く（民法140条・大判昭和10年7月15日）。
 */
export function latestDispatchDate(meetingDate: string, periodDays: number): string {
  return addDays(meetingDate, -(periodDays + 1));
}

// ---------------------------------------------------------------------------
// Convocation notice periods
// ---------------------------------------------------------------------------

export interface NoticePeriod {
  days: number;
  writtenRequired: boolean;
  basis: string;
}

export interface VotingArrangements {
  written_voting: boolean;
  electronic_voting: boolean;
}

function hasRemoteVoting(voting: VotingArrangements): boolean {
  return voting.written_voting || voting.electronic_voting;
}

function nonPublicNoticeDays(
  profile: CompanyGovernanceProfile,
  articles: ArticlesOfIncorporationRules
): { days: number; basis: string } {
  const shortened = articles.shareholders_notice_days;
  if (!profile.has_board && shortened !== undefined && shortened < NON_PUBLIC_NOTICE_DAYS) {
    return { days: shortened, basis: "会社法299条1項括弧書（取締役会非設置会社・定款で短縮）" };
  }
  return { days: NON_PUBLIC_NOTICE_DAYS, basis: "会社法299条1項（公開会社でない株式会社）" };
}

function shareholderNoticeDays(
  profile: CompanyGovernanceProfile,
  articles: ArticlesOfIncorporationRules,
  voting: VotingArrangements
): { days: number; basis: string } {
  if (profile.uses_electronic_provision) {
    return { days: TWO_WEEK_NOTICE_DAYS, basis: "会社法325条の4第1項（電子提供措置）" };
  }
  if (hasRemoteVoting(voting)) {
    return { days: TWO_WEEK_NOTICE_DAYS, basis: "会社法299条1項（書面・電磁的方法による議決権行使を定めた場合）" };
  }
  if (profile.is_public_company) {
    return { days: TWO_WEEK_NOTICE_DAYS, basis: "会社法299条1項（公開会社）" };
  }
  return nonPublicNoticeDays(profile, articles);
}

export function resolveShareholderNoticePeriod(
  profile: CompanyGovernanceProfile,
  articles: ArticlesOfIncorporationRules,
  voting: VotingArrangements
): NoticePeriod {
  const { days, basis } = shareholderNoticeDays(profile, articles, voting);
  return { days, basis, writtenRequired: hasRemoteVoting(voting) || profile.has_board };
}

export function resolveBoardNoticePeriod(articles: ArticlesOfIncorporationRules): NoticePeriod {
  const shortened = articles.board_notice_days;
  if (shortened !== undefined && shortened < BOARD_NOTICE_DAYS) {
    return { days: shortened, writtenRequired: false, basis: "会社法368条1項括弧書（定款で短縮）" };
  }
  return { days: BOARD_NOTICE_DAYS, writtenRequired: false, basis: "会社法368条1項" };
}

// ---------------------------------------------------------------------------
// Omission paths (招集手続省略 · 決議の省略)
// ---------------------------------------------------------------------------

export type OmissionAvailability = "applied" | "available_with_unanimous_consent" | "not_available";

export interface OmissionPath {
  id: string;
  label: string;
  availability: OmissionAvailability;
  basis: string;
  detail: string;
}

export function isUnanimous(consent: ConsentRecord | undefined): boolean {
  return consent !== undefined && consent.eligible > 0 && consent.consented === consent.eligible;
}

function consentAvailability(consent: ConsentRecord | undefined): OmissionAvailability {
  return isUnanimous(consent) ? "applied" : "available_with_unanimous_consent";
}

export function shareholderOmissionPaths(meeting: StatutoryMeeting): OmissionPath[] {
  const remoteVoting = hasRemoteVoting(meeting);
  const convocation: OmissionPath = {
    id: "convocation-omission-300",
    label: "株主全員の同意による招集手続の省略",
    availability: remoteVoting ? "not_available" : consentAvailability(meeting.convocation_omission),
    basis: "会社法300条",
    detail: remoteVoting ? "書面・電磁的方法による議決権行使を定めた場合は不可（300条ただし書）" : "議決権を有する株主全員の同意",
  };
  const writtenResolution: OmissionPath = {
    id: "written-resolution-319",
    label: "株主総会の決議の省略（書面・電磁的記録による全員同意）",
    availability:
      meeting.mode === "written_resolution" ? consentAvailability(meeting.written_consent) : "available_with_unanimous_consent",
    basis: "会社法319条1項",
    detail: "議決権を行使できる株主全員の書面又は電磁的記録による同意",
  };
  return [convocation, writtenResolution];
}

function boardWrittenResolutionAvailability(
  meeting: StatutoryMeeting,
  articles: ArticlesOfIncorporationRules
): OmissionAvailability {
  if (!articles.allow_board_written_resolution) return "not_available";
  if (meeting.mode !== "written_resolution") return "available_with_unanimous_consent";
  return consentAvailability(meeting.written_consent);
}

export function boardOmissionPaths(
  meeting: StatutoryMeeting,
  profile: CompanyGovernanceProfile,
  articles: ArticlesOfIncorporationRules
): OmissionPath[] {
  const consentScope = profile.has_auditor ? "取締役及び監査役全員" : "取締役全員";
  const convocation: OmissionPath = {
    id: "convocation-omission-368-2",
    label: "全員同意による取締役会招集手続の省略",
    availability: consentAvailability(meeting.convocation_omission),
    basis: "会社法368条2項",
    detail: `${consentScope}の同意`,
  };
  const writtenResolution: OmissionPath = {
    id: "written-resolution-370",
    label: "取締役会の決議の省略（書面決議）",
    availability: boardWrittenResolutionAvailability(meeting, articles),
    basis: "会社法370条",
    detail: articles.allow_board_written_resolution
      ? "議決に加わることができる取締役全員の同意 · 監査役の異議なし"
      : "定款の定めがないため不可",
  };
  return [convocation, writtenResolution];
}

// ---------------------------------------------------------------------------
// Record date (基準日)
// ---------------------------------------------------------------------------

export interface RecordDateWindow {
  record_date: string;
  window_end: string;
  meeting_within_window: boolean;
  public_notice_required: boolean;
  public_notice_deadline: string | null;
}

export function recordDateWindow(
  recordDate: string,
  meetingDate: string,
  articlesDefineRecordDate: boolean
): RecordDateWindow {
  const windowEnd = periodEndAfterMonths(recordDate, RECORD_DATE_WINDOW_MONTHS);
  return {
    record_date: recordDate,
    window_end: windowEnd,
    meeting_within_window: recordDate <= meetingDate && meetingDate <= windowEnd,
    public_notice_required: !articlesDefineRecordDate,
    public_notice_deadline: articlesDefineRecordDate ? null : latestDispatchDate(recordDate, RECORD_DATE_NOTICE_DAYS),
  };
}

// ---------------------------------------------------------------------------
// Resolution requirements (309 · 341 · 369)
// ---------------------------------------------------------------------------

interface Threshold {
  ratio: StatutoryRatio;
  /** true = 以上 · false = 過半数（超過） */
  inclusive: boolean;
}

interface ResolutionRequirement {
  basis: string;
  quorum?: Threshold;
  headcount?: Threshold;
  approval: Threshold;
  approvalBase: "present" | "total";
}

interface TalliedVotes {
  total?: number;
  present?: number;
  approving?: number;
  headcountTotal?: number;
  headcountApproving?: number;
}

const STRICT_MAJORITY: Threshold = { ratio: MAJORITY, inclusive: false };

function articlesQuorum(ratio: StatutoryRatio | undefined): Threshold {
  return ratio ? { ratio, inclusive: true } : STRICT_MAJORITY;
}

export function resolutionRequirement(
  type: ResolutionType,
  articles: ArticlesOfIncorporationRules
): ResolutionRequirement {
  switch (type) {
    case "ordinary":
      return {
        basis: "会社法309条1項",
        quorum: articles.ordinary_quorum_excluded ? undefined : STRICT_MAJORITY,
        approval: STRICT_MAJORITY,
        approvalBase: "present",
      };
    case "director_election":
      return { basis: "会社法341条", quorum: articlesQuorum(articles.election_quorum), approval: STRICT_MAJORITY, approvalBase: "present" };
    case "special":
      return {
        basis: "会社法309条2項",
        quorum: articlesQuorum(articles.special_quorum),
        approval: { ratio: TWO_THIRDS, inclusive: true },
        approvalBase: "present",
      };
    case "special_309_3":
      return {
        basis: "会社法309条3項",
        headcount: { ratio: HALF_OR_MORE, inclusive: true },
        approval: { ratio: TWO_THIRDS, inclusive: true },
        approvalBase: "total",
      };
    case "special_309_4":
      return {
        basis: "会社法309条4項",
        headcount: { ratio: HALF_OR_MORE, inclusive: true },
        approval: { ratio: THREE_QUARTERS, inclusive: true },
        approvalBase: "total",
      };
    case "board":
      return { basis: "会社法369条1項", quorum: STRICT_MAJORITY, approval: STRICT_MAJORITY, approvalBase: "present" };
  }
}

export function meetsThreshold(part: number, whole: number, threshold: Threshold): boolean {
  if (whole <= 0) return false;
  const lhs = part * threshold.ratio.denominator;
  const rhs = whole * threshold.ratio.numerator;
  return threshold.inclusive ? lhs >= rhs : lhs > rhs;
}

export function isRatioBelowMinimum(ratio: StatutoryRatio, minimum: StatutoryRatio): boolean {
  return ratio.numerator * minimum.denominator < minimum.numerator * ratio.denominator;
}

function tallyVotes(type: ResolutionType, votes: ResolutionVotes | undefined): TalliedVotes {
  if (!votes) return {};
  if (type === "board") {
    return { total: votes.directors_eligible, present: votes.directors_present, approving: votes.directors_for };
  }
  return {
    total: votes.voting_rights_total,
    present: votes.voting_rights_present,
    approving: votes.voting_rights_for,
    headcountTotal: votes.shareholders_total,
    headcountApproving: votes.shareholders_for,
  };
}

function missingTallyFields(requirement: ResolutionRequirement, tally: TalliedVotes): boolean {
  if (tally.total === undefined || tally.approving === undefined) return true;
  if ((requirement.quorum || requirement.approvalBase === "present") && tally.present === undefined) return true;
  return Boolean(requirement.headcount) && (tally.headcountTotal === undefined || tally.headcountApproving === undefined);
}

function isTallyInconsistent(tally: TalliedVotes): boolean {
  const total = tally.total ?? 0;
  const approving = tally.approving ?? 0;
  if (tally.present !== undefined && (tally.present > total || approving > tally.present)) return true;
  if (approving > total) return true;
  return (tally.headcountApproving ?? 0) > (tally.headcountTotal ?? 0);
}

function requirementMet(requirement: ResolutionRequirement, tally: TalliedVotes): boolean {
  const total = tally.total ?? 0;
  const present = tally.present ?? 0;
  const approving = tally.approving ?? 0;
  if (requirement.quorum && !meetsThreshold(present, total, requirement.quorum)) return false;
  if (requirement.headcount && !meetsThreshold(tally.headcountApproving ?? 0, tally.headcountTotal ?? 0, requirement.headcount)) {
    return false;
  }
  const base = requirement.approvalBase === "present" ? present : total;
  return meetsThreshold(approving, base, requirement.approval);
}

export interface ResolutionEvaluation {
  resolution_id: string;
  agenda: string;
  type: ResolutionType;
  status: CheckStatus;
  requirement_met: boolean | null;
  detail: string;
  basis: string;
}

function articlesQuorumRatio(type: ResolutionType, articles: ArticlesOfIncorporationRules): StatutoryRatio | undefined {
  if (type === "special") return articles.special_quorum;
  if (type === "director_election") return articles.election_quorum;
  return undefined;
}

function articlesQuorumIssue(type: ResolutionType, articles: ArticlesOfIncorporationRules): boolean {
  const ratio = articlesQuorumRatio(type, articles);
  return ratio !== undefined && isRatioBelowMinimum(ratio, MIN_ARTICLES_QUORUM);
}

function statusForOutcome(met: boolean, resolution: StatutoryResolution, articles: ArticlesOfIncorporationRules): CheckStatus {
  if (resolution.outcome_recorded === "rejected") return "ok";
  if (!met) return "issue";
  return articles.heightened_requirements ? "needs_review" : "ok";
}

export function evaluateResolution(
  resolution: StatutoryResolution,
  articles: ArticlesOfIncorporationRules
): ResolutionEvaluation {
  const requirement = resolutionRequirement(resolution.type, articles);
  const tally = tallyVotes(resolution.type, resolution.votes);
  const base = { resolution_id: resolution.id, agenda: resolution.agenda, type: resolution.type, basis: requirement.basis };
  if (articlesQuorumIssue(resolution.type, articles)) {
    return { ...base, status: "issue", requirement_met: null, detail: "定款の定足数が法定下限（1/3）未満" };
  }
  if (missingTallyFields(requirement, tally)) {
    return { ...base, status: "needs_review", requirement_met: null, detail: "議決権数・出席数・賛成数の記録が不足" };
  }
  if (isTallyInconsistent(tally)) {
    return { ...base, status: "issue", requirement_met: null, detail: "票数の整合性エラー（賛成 ≤ 出席 ≤ 総数）" };
  }
  const met = requirementMet(requirement, tally);
  const status = statusForOutcome(met, resolution, articles);
  const suffix = articles.heightened_requirements && met ? " · 定款で加重された要件は人間確認" : "";
  const detail = `${met ? "決議要件充足" : "決議要件不足"}${resolution.outcome_recorded ? `（記録: ${resolution.outcome_recorded}）` : ""}${suffix}`;
  return { ...base, status, requirement_met: met, detail };
}

// ---------------------------------------------------------------------------
// Minutes required items (会社法施行規則72条・101条 · 会社法369条3項)
// ---------------------------------------------------------------------------

export interface MinutesItemSet {
  required: readonly string[];
  conditional: readonly string[];
  basis: string;
}

/** 施行規則72条3項 */
const SHAREHOLDERS_CONVENED_ITEMS: MinutesItemSet = {
  required: ["datetime_place", "proceedings_and_results", "attending_officers", "minutes_author_director"],
  conditional: ["attendance_method", "statutory_opinions", "chair"],
  basis: "会社法施行規則72条3項",
};
/** 施行規則72条4項1号 */
const SHAREHOLDERS_DEEMED_ITEMS: MinutesItemSet = {
  required: ["deemed_matters", "proposer", "deemed_date", "minutes_author_director"],
  conditional: [],
  basis: "会社法施行規則72条4項1号",
};
/** 施行規則101条3項 · 会社法369条3項（出席取締役・監査役の署名又は記名押印） */
const BOARD_CONVENED_ITEMS: MinutesItemSet = {
  required: ["datetime_place", "proceedings_and_results", "attendee_signatures"],
  conditional: [
    "attendance_method",
    "special_board_373",
    "convened_by_request",
    "special_interest_directors",
    "statutory_opinions",
    "attending_non_directors",
    "chair",
  ],
  basis: "会社法施行規則101条3項 · 会社法369条3項",
};
/** 施行規則101条4項1号 */
const BOARD_DEEMED_ITEMS: MinutesItemSet = {
  required: ["deemed_matters", "proposing_director", "deemed_date", "minutes_author_director"],
  conditional: [],
  basis: "会社法施行規則101条4項1号",
};

export function minutesItemSet(body: MeetingBody, mode: StatutoryMeeting["mode"]): MinutesItemSet {
  if (body === "shareholders") {
    return mode === "written_resolution" ? SHAREHOLDERS_DEEMED_ITEMS : SHAREHOLDERS_CONVENED_ITEMS;
  }
  return mode === "written_resolution" ? BOARD_DEEMED_ITEMS : BOARD_CONVENED_ITEMS;
}

export function checkMinutesItems(itemSet: MinutesItemSet, minutes: MinutesRecord | undefined): CheckItem {
  const base = { id: "minutes-required-items", label: "議事録の法定記載事項", basis: itemSet.basis };
  if (!minutes || minutes.status === "not_started") {
    return { ...base, status: "issue", detail: "議事録未作成（会社法318条1項・369条3項）" };
  }
  const applicable = minutes.conditional_items_applicable ?? [];
  const expected = [...itemSet.required, ...applicable.filter((item) => itemSet.conditional.includes(item))];
  const missing = expected.filter((item) => !minutes.recorded_items.includes(item));
  if (missing.length) {
    return { ...base, status: "issue", detail: `未記載: ${missing.join(", ")}` };
  }
  if (itemSet.conditional.length && minutes.conditional_items_applicable === undefined) {
    return { ...base, status: "needs_review", detail: `必須事項あり · 条件付き事項（${itemSet.conditional.join(", ")}）の該当性未確認` };
  }
  return { ...base, status: "ok", detail: `${expected.length} 項目記載済み` };
}

// ---------------------------------------------------------------------------
// Retention (318 · 319 · 371)
// ---------------------------------------------------------------------------

export interface RetentionPlan {
  head_office_until: string;
  branch_copy_required: boolean;
  branch_copy_until: string | null;
}

function branchCopyRequired(body: MeetingBody, profile: CompanyGovernanceProfile, minutes: MinutesRecord | undefined): boolean {
  if (body !== "shareholders" || !profile.has_branches) return false;
  return !(minutes?.medium === "electronic" && minutes.branch_access_measures);
}

export function minutesRetentionPlan(
  body: MeetingBody,
  meetingDate: string,
  profile: CompanyGovernanceProfile,
  minutes: MinutesRecord | undefined
): RetentionPlan {
  const branchRequired = branchCopyRequired(body, profile, minutes);
  return {
    head_office_until: periodEndAfterMonths(meetingDate, HEAD_OFFICE_RETENTION_YEARS * MONTHS_PER_YEAR),
    branch_copy_required: branchRequired,
    branch_copy_until: branchRequired
      ? periodEndAfterMonths(meetingDate, BRANCH_COPY_RETENTION_YEARS * MONTHS_PER_YEAR)
      : null,
  };
}

export function checkRetention(body: MeetingBody, plan: RetentionPlan, minutes: MinutesRecord | undefined): CheckItem {
  const basis = body === "shareholders" ? "会社法318条2項・3項" : "会社法371条1項";
  const base = { id: "minutes-retention", label: "議事録の備置", basis };
  if (!minutes?.kept_at_head_office) {
    return { ...base, status: "issue", detail: `本店備置の記録なし（${plan.head_office_until} まで）` };
  }
  if (plan.branch_copy_required && !minutes.branch_copy_kept) {
    return { ...base, status: "issue", detail: `支店への写し備置の記録なし（${plan.branch_copy_until} まで）` };
  }
  const branch = plan.branch_copy_required ? ` · 支店写し ${plan.branch_copy_until} まで` : "";
  return { ...base, status: "ok", detail: `本店 ${plan.head_office_until} まで${branch}` };
}

// ---------------------------------------------------------------------------
// Notice timing
// ---------------------------------------------------------------------------

export interface NoticeTimingInput {
  meetingDate: string;
  period: NoticePeriod;
  noticeSentOn: string | undefined;
  asOf: string;
}

export function checkNoticeTiming(input: NoticeTimingInput): CheckItem {
  const deadline = latestDispatchDate(input.meetingDate, input.period.days);
  const base = { id: "notice-timing", label: `招集通知の発出期限（中${input.period.days}日）`, basis: input.period.basis };
  if (input.noticeSentOn) {
    const onTime = input.noticeSentOn <= deadline;
    return { ...base, status: onTime ? "ok" : "issue", detail: `発出 ${input.noticeSentOn} · 期限 ${deadline}` };
  }
  if (input.asOf <= deadline) {
    return { ...base, status: "needs_review", detail: `未発出 · 期限 ${deadline}（残り ${daysBetween(input.asOf, deadline)} 日）` };
  }
  return { ...base, status: "issue", detail: `未発出のまま期限 ${deadline} を経過` };
}

export function checkNoticeMethod(meeting: StatutoryMeeting, period: NoticePeriod): CheckItem {
  const base = { id: "notice-method", label: "招集通知の方法", basis: "会社法299条2項・3項" };
  if (!meeting.notice_method) {
    return { ...base, status: "needs_review", detail: period.writtenRequired ? "書面通知が必要 · 方法未記録" : "方法未記録" };
  }
  if (period.writtenRequired && meeting.notice_method === "oral") {
    return { ...base, status: "issue", detail: "書面（又は承諾を得た電磁的方法）による通知が必要" };
  }
  if (period.writtenRequired && meeting.notice_method === "electronic" && !meeting.electronic_notice_consent) {
    return { ...base, status: "needs_review", detail: "電磁的方法 — 株主の承諾取得を確認（299条3項）" };
  }
  return { ...base, status: "ok", detail: meeting.notice_method };
}

export function checkMandatoryWrittenVoting(meeting: StatutoryMeeting, profile: CompanyGovernanceProfile): CheckItem {
  const base = { id: "mandatory-written-voting", label: "株主1,000人以上の書面投票", basis: "会社法298条2項" };
  const count = profile.voting_shareholders_count;
  if (count === undefined) {
    return { ...base, status: "needs_review", detail: "議決権を有する株主数が未記録" };
  }
  if (count < MANDATORY_WRITTEN_VOTING_SHAREHOLDERS || meeting.written_voting) {
    return { ...base, status: "ok", detail: `株主 ${count} 名 · 書面投票 ${meeting.written_voting ? "あり" : "なし"}` };
  }
  if (profile.is_public_company) {
    return { ...base, status: "needs_review", detail: "上場会社の委任状勧誘による例外（298条2項ただし書）を確認" };
  }
  return { ...base, status: "issue", detail: `株主 ${count} 名 — 書面投票の定めが必要` };
}
