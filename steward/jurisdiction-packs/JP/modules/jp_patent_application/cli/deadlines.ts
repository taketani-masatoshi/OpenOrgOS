import type {
  PatentApplication,
  PatentApplicationStatus,
  PatentDisclosure,
  PatentPriorityClaim,
} from "../../../../../../schemas/jp-patent.js";
import {
  calendarDaysBetween,
  procedureDeadline,
  statutoryDaysEnd,
  statutoryPeriodEnd,
  type HolidayCalendar,
  type ProcedureDeadline,
} from "./calendar.js";

/** 特許法30条1項・2項: 公開日から1年以内にした特許出願 */
export const NOVELTY_GRACE_PERIOD_YEARS = 1;
/** 特許法30条3項: 証明書は特許出願の日から30日以内 */
export const NOVELTY_CERTIFICATE_DAYS = 30;
/** 特許法41条1項1号: 先の出願の日から1年以内 */
export const DOMESTIC_PRIORITY_PERIOD_YEARS = 1;
/** パリ条約4条C(1): 特許の優先期間は12箇月（C(2) 初日不算入 · C(3) 休日は次の就業日まで延長） */
export const PARIS_PRIORITY_PERIOD_MONTHS = 12;
/** 特許法施行規則27条の4の2第1項・第2項: 優先期間の経過後2月（故意でない場合の優先権回復枠） */
export const PRIORITY_RESTORATION_MONTHS = 2;
/** 特許法48条の3第1項: 出願の日から3年以内に出願審査の請求 */
export const EXAM_REQUEST_PERIOD_YEARS = 3;
/** 特許法64条1項: 出願の日（36条の2第2項括弧書により最先の優先日）から1年6月経過で出願公開 */
export const PUBLICATION_PERIOD_MONTHS = 18;
/** 特許法67条1項: 存続期間は出願の日から20年 */
export const PATENT_TERM_YEARS = 20;
/** 特許法108条1項: 第1〜3年分の特許料は査定謄本送達日から30日以内に一時に納付 */
export const FIRST_PAYMENT_DAYS = 30;
export const FIRST_PAYMENT_YEARS = 3;
/** 特許法112条1項: 納付期間の経過後6月以内の追納 */
export const LATE_PAYMENT_GRACE_MONTHS = 6;
/** 運用上の注意喚起幅（法定期間ではない） */
export const DUE_SOON_WINDOW_DAYS = 30;

export type DeadlineStatus = "upcoming" | "due" | "overdue" | "done" | "needs_review";

export interface DeadlineOutcome {
  status: DeadlineStatus;
  detail: string;
}

export interface PatentDeadline extends DeadlineOutcome {
  application_id: string;
  id: string;
  label: string;
  legal_basis: string;
  date: string | null;
  statutory_end?: string;
  holiday_extended?: boolean;
  estimated?: boolean;
}

interface DeadlineMeta {
  id: string;
  label: string;
  legal_basis: string;
}

interface DeadlineContext {
  app: PatentApplication;
  calendar: HolidayCalendar;
  asOf: string;
}

export interface FilingWindow {
  deadline: ProcedureDeadline;
  restoration?: ProcedureDeadline;
}

export type FilingWindowOutcome = "within" | "within_by_holiday" | "restorable" | "late" | "calendar_unknown";

const INACTIVE_STATUSES: ReadonlySet<PatentApplicationStatus> = new Set(["abandoned", "withdrawn", "lapsed"]);

export function classifyOpenDeadline(due: string, asOf: string): "upcoming" | "due" | "overdue" {
  const remaining = calendarDaysBetween(asOf, due);
  if (remaining < 0) return "overdue";
  return remaining <= DUE_SOON_WINDOW_DAYS ? "due" : "upcoming";
}

export function priorityWindow(claim: PatentPriorityClaim, calendar: HolidayCalendar): FilingWindow {
  const period = claim.kind === "paris" ? { months: PARIS_PRIORITY_PERIOD_MONTHS } : { years: DOMESTIC_PRIORITY_PERIOD_YEARS };
  const deadline = procedureDeadline(statutoryPeriodEnd(claim.base_filed_on, period), calendar);
  const restorationEnd = statutoryPeriodEnd(deadline.due, { months: PRIORITY_RESTORATION_MONTHS });
  return { deadline, restoration: procedureDeadline(restorationEnd, calendar) };
}

export function noveltyWindow(disclosure: PatentDisclosure, calendar: HolidayCalendar): FilingWindow {
  const end = statutoryPeriodEnd(disclosure.disclosed_on, { years: NOVELTY_GRACE_PERIOD_YEARS });
  return { deadline: procedureDeadline(end, calendar) };
}

/** パリ条約優先期間は4条C(3)で休日延長が明文化。国内優先・30条の期間への3条2項適用は要確認扱い。 */
export function isHolidayExtensionVerified(claim: PatentPriorityClaim | null): boolean {
  return claim?.kind === "paris";
}

export function isExcludedFromNoveltyException(disclosure: PatentDisclosure): boolean {
  return disclosure.kind === "patent_gazette" && !disclosure.against_will;
}

export function assessFilingDate(filingDate: string, window: FilingWindow): FilingWindowOutcome {
  if (filingDate <= window.deadline.statutory_end) return "within";
  if (window.deadline.uncovered_year !== undefined) return "calendar_unknown";
  if (filingDate <= window.deadline.due) return "within_by_holiday";
  if (!window.restoration) return "late";
  if (window.restoration.uncovered_year !== undefined) return "calendar_unknown";
  return filingDate <= window.restoration.due ? "restorable" : "late";
}

function calendarUnknown(deadline: ProcedureDeadline): DeadlineOutcome {
  return {
    status: "needs_review",
    detail: `法定末日 ${deadline.statutory_end} · holidays.yaml に ${deadline.uncovered_year} 年がなく休日順延（特許法3条2項）を確認できない`,
  };
}

export function filingOutcome(
  outcome: FilingWindowOutcome,
  window: FilingWindow,
  holidayExtensionVerified: boolean
): DeadlineOutcome {
  const due = window.deadline.due;
  switch (outcome) {
    case "within":
      return { status: "done", detail: `期間内（末日 ${due}）` };
    case "within_by_holiday":
      return holidayExtensionVerified
        ? { status: "done", detail: `休日延長後の期間内（末日 ${due}）` }
        : { status: "needs_review", detail: `法定末日 ${window.deadline.statutory_end} 後 · 休日順延（特許法3条2項）に依拠 — 適用可否を確認` };
    case "restorable":
      return { status: "needs_review", detail: `期間経過後 · 回復枠（〜${window.restoration?.due}）内 — 故意でないと認められる場合に限る（要件は要確認）` };
    case "late":
      return { status: "overdue", detail: `期間（末日 ${due}）経過後の出願` };
    case "calendar_unknown":
      return calendarUnknown(window.deadline);
  }
}

function openWindowOutcome(window: FilingWindow, ctx: DeadlineContext, holidayExtensionVerified: boolean): DeadlineOutcome {
  const { deadline, restoration } = window;
  if (deadline.uncovered_year !== undefined) return calendarUnknown(deadline);
  if (ctx.asOf > deadline.due) {
    return restoration && ctx.asOf <= restoration.due
      ? { status: "needs_review", detail: `未出願で期間経過 · 回復枠（〜${restoration.due}）— 故意でないと認められる場合に限る` }
      : { status: "overdue", detail: `未出願のまま期間（末日 ${deadline.due}）経過` };
  }
  const planned = ctx.app.planned_filing_on;
  if (planned) {
    const plannedOutcome = filingOutcome(assessFilingDate(planned, window), window, holidayExtensionVerified);
    if (plannedOutcome.status !== "done") return { status: "needs_review", detail: `出願予定日 ${planned}: ${plannedOutcome.detail}` };
  }
  return { status: classifyOpenDeadline(deadline.due, ctx.asOf), detail: planned ? `出願予定 ${planned}` : "出願予定日未設定" };
}

function windowOutcome(window: FilingWindow, ctx: DeadlineContext, holidayExtensionVerified: boolean): DeadlineOutcome {
  if (!ctx.app.filed_on) return openWindowOutcome(window, ctx, holidayExtensionVerified);
  return filingOutcome(assessFilingDate(ctx.app.filed_on, window), window, holidayExtensionVerified);
}

export function submissionOutcome(
  deadline: ProcedureDeadline,
  submittedOn: string | undefined,
  asOf: string,
  lateNote: string
): DeadlineOutcome {
  if (submittedOn && submittedOn <= deadline.statutory_end) return { status: "done", detail: `済 ${submittedOn}` };
  if (deadline.uncovered_year !== undefined) return calendarUnknown(deadline);
  if (submittedOn) {
    return submittedOn <= deadline.due
      ? { status: "done", detail: `済 ${submittedOn}（休日順延後の期間内）` }
      : { status: "overdue", detail: `${submittedOn} は期限 ${deadline.due} 後 — ${lateNote}` };
  }
  const status = classifyOpenDeadline(deadline.due, asOf);
  return { status, detail: status === "overdue" ? `未了 — ${lateNote}` : "未了" };
}

function estimateOutcome(deadline: ProcedureDeadline): DeadlineOutcome {
  if (deadline.uncovered_year !== undefined) return calendarUnknown(deadline);
  return { status: "upcoming", detail: "出願予定日からの見込み（未出願）" };
}

function procedureItem(
  app: PatentApplication,
  meta: DeadlineMeta,
  deadline: ProcedureDeadline,
  outcome: DeadlineOutcome,
  extras: { estimated?: boolean } = {}
): PatentDeadline {
  return {
    application_id: app.id,
    ...meta,
    date: deadline.due,
    statutory_end: deadline.statutory_end,
    holiday_extended: deadline.holiday_extended,
    ...extras,
    ...outcome,
  };
}

function dateItem(
  app: PatentApplication,
  meta: DeadlineMeta,
  date: string | null,
  outcome: DeadlineOutcome,
  extras: { estimated?: boolean } = {}
): PatentDeadline {
  return { application_id: app.id, ...meta, date, ...extras, ...outcome };
}

function priorityDeadlines(ctx: DeadlineContext): PatentDeadline[] {
  return ctx.app.priority_claims.map((claim, index) => {
    const window = priorityWindow(claim, ctx.calendar);
    const meta: DeadlineMeta =
      claim.kind === "paris"
        ? { id: `priority-${index + 1}`, label: `パリ条約優先期間（第一国出願 ${claim.base_filed_on}）`, legal_basis: "パリ条約4条C(1)-(3) · 特許法43条の2 · 施行規則27条の4の2第2項" }
        : { id: `priority-${index + 1}`, label: `国内優先権の優先期間（先の出願 ${claim.base_filed_on}）`, legal_basis: "特許法41条1項1号 · 3条 · 施行規則27条の4の2第1項" };
    return procedureItem(ctx.app, meta, window.deadline, windowOutcome(window, ctx, isHolidayExtensionVerified(claim)));
  });
}

function noveltyWindowDeadline(ctx: DeadlineContext, disclosure: PatentDisclosure, index: number): PatentDeadline {
  const window = noveltyWindow(disclosure, ctx.calendar);
  const meta: DeadlineMeta = {
    id: `novelty-filing-${index + 1}`,
    label: `新規性喪失の例外 — 出願期限（公開 ${disclosure.disclosed_on}）`,
    legal_basis: disclosure.against_will ? "特許法30条1項" : "特許法30条2項",
  };
  if (isExcludedFromNoveltyException(disclosure)) {
    return procedureItem(ctx.app, meta, window.deadline, { status: "needs_review", detail: "公報掲載による公開は30条2項括弧書により適用対象外" });
  }
  return procedureItem(ctx.app, meta, window.deadline, windowOutcome(window, ctx, isHolidayExtensionVerified(null)));
}

function noveltyCertificateDeadline(ctx: DeadlineContext, disclosure: PatentDisclosure, index: number): PatentDeadline {
  const meta: DeadlineMeta = {
    id: `novelty-certificate-${index + 1}`,
    label: `新規性喪失の例外 — 証明書提出期限（公開 ${disclosure.disclosed_on}）`,
    legal_basis: "特許法30条3項（4項の救済は要確認）",
  };
  const filingDate = ctx.app.filed_on ?? ctx.app.planned_filing_on;
  if (!filingDate) return dateItem(ctx.app, meta, null, { status: "needs_review", detail: "出願日（予定）未設定" });
  const deadline = procedureDeadline(statutoryDaysEnd(filingDate, NOVELTY_CERTIFICATE_DAYS), ctx.calendar);
  if (!ctx.app.filed_on) return procedureItem(ctx.app, meta, deadline, estimateOutcome(deadline), { estimated: true });
  const lateNote = "30条4項（責めに帰することができない理由）の救済可否を確認";
  return procedureItem(ctx.app, meta, deadline, submissionOutcome(deadline, disclosure.certificate_submitted_on, ctx.asOf, lateNote));
}

function noveltyDeadlines(ctx: DeadlineContext): PatentDeadline[] {
  return ctx.app.disclosures.flatMap((disclosure, index) => {
    const filing = noveltyWindowDeadline(ctx, disclosure, index);
    if (disclosure.against_will || isExcludedFromNoveltyException(disclosure)) return [filing];
    return [filing, noveltyCertificateDeadline(ctx, disclosure, index)];
  });
}

function examRequestDeadline(ctx: DeadlineContext): PatentDeadline {
  const { app } = ctx;
  const meta: DeadlineMeta = { id: "exam-request", label: "出願審査請求期限", legal_basis: "特許法48条の3第1項（4項 みなし取下げ · 5項 回復は要確認）" };
  const filingDate = app.filed_on ?? app.planned_filing_on;
  if (!filingDate) return dateItem(app, meta, null, { status: "needs_review", detail: "出願日（予定）未設定" });
  const deadline = procedureDeadline(statutoryPeriodEnd(filingDate, { years: EXAM_REQUEST_PERIOD_YEARS }), ctx.calendar);
  if (!app.filed_on) return procedureItem(app, meta, deadline, estimateOutcome(deadline), { estimated: true });
  if (!app.exam_requested_on && (app.allowance_served_on || app.registered_on)) {
    return procedureItem(app, meta, deadline, { status: "done", detail: "査定済（審査請求済）" });
  }
  const lateNote = "48条の3第4項により取り下げたものとみなされる — 同条5項の回復可否を確認";
  return procedureItem(app, meta, deadline, submissionOutcome(deadline, app.exam_requested_on, ctx.asOf, lateNote));
}

export function earliestPriorityDate(app: PatentApplication): string | null {
  const filingDate = app.filed_on ?? app.planned_filing_on;
  const candidates = [...app.priority_claims.map((c) => c.base_filed_on), ...(filingDate ? [filingDate] : [])];
  return candidates.length ? [...candidates].sort()[0] : null;
}

function publicationEstimate(ctx: DeadlineContext): PatentDeadline {
  const { app } = ctx;
  const meta: DeadlineMeta = { id: "publication", label: "出願公開（1年6月経過日 · 目安）", legal_basis: "特許法64条1項 · 36条の2第2項括弧書（最先の優先日から起算）" };
  const baseDate = earliestPriorityDate(app);
  if (!baseDate) return dateItem(app, meta, null, { status: "needs_review", detail: "出願日・優先日が未設定" });
  const date = statutoryPeriodEnd(baseDate, { months: PUBLICATION_PERIOD_MONTHS });
  if (app.published_on) return dateItem(app, meta, date, { status: "done", detail: `公開済 ${app.published_on}` });
  if (!app.filed_on) return dateItem(app, meta, date, { status: "upcoming", detail: "出願予定日ベースの見込み" }, { estimated: true });
  if (ctx.asOf <= date) return dateItem(app, meta, date, { status: "upcoming", detail: "この日の経過後に公開（出願公開の請求があれば早まる）" });
  return dateItem(app, meta, date, { status: "needs_review", detail: "1年6月経過 — J-PlatPat で公開を確認し published_on を記録" });
}

function firstPaymentDeadline(ctx: DeadlineContext): PatentDeadline[] {
  const { app } = ctx;
  if (!app.allowance_served_on) return [];
  const meta: DeadlineMeta = { id: "first-payment", label: `第1〜${FIRST_PAYMENT_YEARS}年分特許料の一括納付期限`, legal_basis: "特許法108条1項（3項 期間延長請求 · 4項 救済は要確認）" };
  const deadline = procedureDeadline(statutoryDaysEnd(app.allowance_served_on, FIRST_PAYMENT_DAYS), ctx.calendar);
  if (app.registered_on) return [procedureItem(app, meta, deadline, { status: "done", detail: `設定登録 ${app.registered_on}` })];
  return [procedureItem(app, meta, deadline, submissionOutcome(deadline, undefined, ctx.asOf, "108条3項・4項の可否を確認"))];
}

export function annuityOutcome(deadline: ProcedureDeadline, grace: ProcedureDeadline, asOf: string): DeadlineOutcome {
  if (deadline.uncovered_year !== undefined) return calendarUnknown(deadline);
  const status = classifyOpenDeadline(deadline.due, asOf);
  if (status !== "overdue") return { status, detail: `未納付 · 追納期間の末日 ${grace.due}（112条1項）` };
  if (grace.uncovered_year !== undefined) return calendarUnknown(grace);
  if (asOf <= grace.due) {
    return { status: "overdue", detail: `追納期間内（〜${grace.due}）· 特許料と同額の割増特許料が必要（112条2項 · 金額は算定しない）` };
  }
  return { status: "overdue", detail: `追納期間（〜${grace.due}）経過 — 112条4項により消滅したものとみなされる可能性 · 112条の2 回復は要確認` };
}

function annuityDeadline(ctx: DeadlineContext): PatentDeadline[] {
  const { app } = ctx;
  if (!app.registered_on) return [];
  const paidThrough = app.annuity_paid_through_year;
  const meta: DeadlineMeta = { id: "annuity", label: `第${(paidThrough ?? FIRST_PAYMENT_YEARS) + 1}年分特許料の納付期限`, legal_basis: "特許法108条2項 · 112条" };
  if (!app.filed_on) return [dateItem(app, meta, null, { status: "needs_review", detail: "filed_on 未設定のため存続期間を判定できない" })];
  if (paidThrough === undefined) {
    return [dateItem(app, meta, null, { status: "needs_review", detail: "annuity_paid_through_year 未設定（66条2項の納付・免除・猶予の別を確認）" })];
  }
  const expiry = statutoryPeriodEnd(app.filed_on, { years: PATENT_TERM_YEARS });
  const statutoryDue = statutoryPeriodEnd(app.registered_on, { years: paidThrough });
  if (statutoryDue >= expiry) return [dateItem(app, meta, null, { status: "done", detail: `存続期間満了（${expiry}）まで納付済 · 延長登録は対象外` })];
  const deadline = procedureDeadline(statutoryDue, ctx.calendar);
  const grace = procedureDeadline(statutoryPeriodEnd(deadline.due, { months: LATE_PAYMENT_GRACE_MONTHS }), ctx.calendar);
  return [procedureItem(app, meta, deadline, annuityOutcome(deadline, grace, ctx.asOf))];
}

function termExpiry(ctx: DeadlineContext): PatentDeadline[] {
  const { app } = ctx;
  if (!app.registered_on || !app.filed_on) return [];
  const meta: DeadlineMeta = { id: "term-expiry", label: "存続期間満了日", legal_basis: "特許法67条1項（3条2項の休日順延は適用なし · 延長登録は対象外）" };
  const expiry = statutoryPeriodEnd(app.filed_on, { years: PATENT_TERM_YEARS });
  const outcome: DeadlineOutcome = ctx.asOf > expiry ? { status: "done", detail: "満了" } : { status: "upcoming", detail: "存続期間の延長登録（67条2項・4項）は対象外" };
  return [dateItem(app, meta, expiry, outcome)];
}

export function computeApplicationDeadlines(app: PatentApplication, calendar: HolidayCalendar, asOf: string): PatentDeadline[] {
  if (INACTIVE_STATUSES.has(app.status)) return [];
  const ctx: DeadlineContext = { app, calendar, asOf };
  return [
    ...priorityDeadlines(ctx),
    ...noveltyDeadlines(ctx),
    examRequestDeadline(ctx),
    publicationEstimate(ctx),
    ...firstPaymentDeadline(ctx),
    ...annuityDeadline(ctx),
    ...termExpiry(ctx),
  ];
}

export function countDeadlinesByStatus(items: readonly PatentDeadline[]): Record<DeadlineStatus, number> {
  const counts: Record<DeadlineStatus, number> = { upcoming: 0, due: 0, overdue: 0, done: 0, needs_review: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}
