import type { ForeignWorker } from "../../../../../../schemas/jp-visa-employment.js";
import type { CheckItem, CheckStatus } from "./check-item.js";
import { addDays, addMonths, dayOfNextMonth, daysBetween, lastDayOfNextMonth } from "./dates.js";
import {
  EMPLOYMENT_NOTICE_EXEMPT_CODES,
  NO_PERIOD_OF_STAY_CODES,
  SELF_NOTIFICATION_DAYS,
  SELF_NOTIFICATION_STATUS_CODES,
} from "./statutory.js";

/** 出入国在留管理庁「在留期間更新許可申請」— 6か月以上の在留期間は満了の3か月前から申請可 */
export const RENEWAL_WINDOW_MONTHS = 3;

/** 更新申請の切迫表示（社内運用の閾値 · 法定期限ではない） */
export const RENEWAL_URGENT_DAYS = 30;

/** 入管法20条6項（21条4項で準用）— 特例期間は処分時又は満了日から2月経過日の終了時のいずれか早い時まで */
export const SPECIAL_PERIOD_MONTHS = 2;

/** 労働施策総合推進法施行規則12条1項 — 雇入れは翌月10日まで（被保険者は雇用保険法施行規則6条の資格取得届と併せて） */
export const INSURED_HIRE_NOTICE_DAY_OF_NEXT_MONTH = 10;

/** 同12条1項 — 離職は翌日から起算して10日以内（資格喪失届と併せて · 離職日を起点に厳しめに計算） */
export const INSURED_SEPARATION_NOTICE_DAYS = 10;

const LEGAL_BASIS_EXPIRY = "入管法21条 · 20条6項（特例期間）";
const LEGAL_BASIS_NOTICE = "労働施策総合推進法28条1項 · 同施行規則12条";
const LEGAL_BASIS_SELF_NOTICE = "入管法19条の16";

export type ExpiryStage =
  | "no_period"
  | "unknown"
  | "ok"
  | "renewal_window"
  | "renewal_filed"
  | "urgent"
  | "special_period"
  | "expired";

export interface ExpiryAssessment extends CheckItem {
  stage: ExpiryStage;
  status_of_residence: string;
  period_expires_on?: string;
  days_remaining?: number;
  renewal_window_opens_on?: string;
}

interface ExpiryTiming {
  expiresOn: string;
  daysRemaining: number;
  opensOn: string;
}

function expiryItem(
  worker: ForeignWorker,
  stage: ExpiryStage,
  status: CheckStatus,
  detail: string,
  timing?: ExpiryTiming
): ExpiryAssessment {
  return {
    id: "period-expiry",
    employee_id: worker.employee_id,
    label: `在留期間満了（${stage}）`,
    status,
    detail,
    legal_basis: LEGAL_BASIS_EXPIRY,
    stage,
    status_of_residence: worker.status_of_residence,
    period_expires_on: timing?.expiresOn,
    days_remaining: timing?.daysRemaining,
    renewal_window_opens_on: timing?.opensOn,
  };
}

/** 更新申請日が当該在留期間の申請可能期間内（満了3か月前〜満了日）にある場合のみ有効とみなす。 */
function isRenewalFiled(worker: ForeignWorker, timing: ExpiryTiming): boolean {
  const filedOn = worker.renewal_application_filed_on;
  return filedOn !== undefined && filedOn >= timing.opensOn && filedOn <= timing.expiresOn;
}

function assessExpired(worker: ForeignWorker, asOf: string, timing: ExpiryTiming): ExpiryAssessment {
  const specialPeriodEndsOn = addMonths(timing.expiresOn, SPECIAL_PERIOD_MONTHS);
  if (isRenewalFiled(worker, timing) && asOf <= specialPeriodEndsOn) {
    return expiryItem(
      worker,
      "special_period",
      "needs_review",
      `満了日 ${timing.expiresOn} 経過 · 満了前に更新申請あり — 特例期間（処分時又は ${specialPeriodEndsOn} 頃の早い方まで · 30日以下の在留期間は対象外）の可能性。申請受付票と処分結果を確認`,
      timing
    );
  }
  return expiryItem(
    worker,
    "expired",
    "alert",
    `在留期間満了日 ${timing.expiresOn} から ${-timing.daysRemaining} 日経過 — 更新後の在留カードを確認できるまで就労させない`,
    timing
  );
}

export function assessPeriodExpiry(worker: ForeignWorker, asOf: string): ExpiryAssessment {
  if (NO_PERIOD_OF_STAY_CODES.has(worker.status_of_residence)) {
    return expiryItem(worker, "no_period", "ok", "在留期間なし（永住者は無期限 · 特別永住者）");
  }
  const expiresOn = worker.period_expires_on;
  if (!expiresOn) return expiryItem(worker, "unknown", "needs_review", "在留期間満了日が未記録");

  const timing: ExpiryTiming = {
    expiresOn,
    daysRemaining: daysBetween(asOf, expiresOn),
    opensOn: addMonths(expiresOn, -RENEWAL_WINDOW_MONTHS),
  };
  const days = timing.daysRemaining;
  if (days < 0) return assessExpired(worker, asOf, timing);
  if (isRenewalFiled(worker, timing)) {
    return expiryItem(
      worker,
      "renewal_filed",
      "ok",
      `満了まで ${days} 日 · 更新申請済（${worker.renewal_application_filed_on}）— 許可後の在留カードを確認し記録更新`,
      timing
    );
  }
  if (days <= RENEWAL_URGENT_DAYS) {
    return expiryItem(worker, "urgent", "alert", `満了まで ${days} 日 — 更新申請の記録なし`, timing);
  }
  if (asOf >= timing.opensOn) {
    return expiryItem(worker, "renewal_window", "notice", `満了まで ${days} 日 — 更新申請可能期間（${timing.opensOn} から）`, timing);
  }
  return expiryItem(worker, "ok", "ok", `満了まで ${days} 日（更新申請は ${timing.opensOn} から）`, timing);
}

export type NoticeEvent = "hire" | "separation";
export type NoticeRoute = "employment_insurance_form" | "form_3" | "exempt";
export type NoticeState = "not_required" | "pending" | "overdue" | "filed" | "filed_late";

export interface NoticeAssessment extends CheckItem {
  event: NoticeEvent;
  event_date: string;
  route: NoticeRoute;
  state: NoticeState;
  due_on?: string;
  filed_on?: string;
  days_until_due?: number;
}

const NOTICE_EVENT_LABELS: Record<NoticeEvent, string> = { hire: "雇入れ", separation: "離職" };

const INSURED_FORM_LABELS: Record<NoticeEvent, string> = {
  hire: "雇用保険 資格取得届で届出",
  separation: "雇用保険 資格喪失届で届出",
};

function noticeRouteLabel(route: NoticeRoute, event: NoticeEvent): string {
  if (route === "employment_insurance_form") return INSURED_FORM_LABELS[event];
  if (route === "form_3") return "外国人雇用状況届出書（様式第3号）";
  return "届出対象外";
}

/** 被保険者: 雇入れ翌月10日 · 離職翌日から10日以内 / 被保険者でない者: 雇入れ・離職の翌月末日（施行規則12条） */
export function employmentNoticeDueDate(event: NoticeEvent, eventDate: string, insured: boolean): string {
  if (!insured) return lastDayOfNextMonth(eventDate);
  if (event === "hire") return dayOfNextMonth(eventDate, INSURED_HIRE_NOTICE_DAY_OF_NEXT_MONTH);
  return addDays(eventDate, INSURED_SEPARATION_NOTICE_DAYS);
}

export function classifyNotice(
  dueOn: string,
  filedOn: string | undefined,
  asOf: string
): { state: NoticeState; status: CheckStatus } {
  if (filedOn) return filedOn <= dueOn ? { state: "filed", status: "ok" } : { state: "filed_late", status: "needs_review" };
  return asOf > dueOn ? { state: "overdue", status: "alert" } : { state: "pending", status: "notice" };
}

function noticeDetail(state: NoticeState, dueOn: string, filedOn: string | undefined, asOf: string): string {
  if (state === "filed") return `提出済 ${filedOn}（期限 ${dueOn}）`;
  if (state === "filed_late") return `提出 ${filedOn} は期限 ${dueOn} 後 — 経緯を記録（是正の要否は人間判断）`;
  if (state === "overdue") return `期限 ${dueOn} を ${daysBetween(dueOn, asOf)} 日超過 — ハローワークへ速やかに届出`;
  return `期限 ${dueOn}（残り ${daysBetween(asOf, dueOn)} 日）`;
}

function assessNotice(
  worker: ForeignWorker,
  event: NoticeEvent,
  eventDate: string,
  filedOn: string | undefined,
  asOf: string
): NoticeAssessment {
  const insured = worker.employment_insurance_insured;
  const route: NoticeRoute = insured ? "employment_insurance_form" : "form_3";
  const dueOn = employmentNoticeDueDate(event, eventDate, insured);
  const { state, status } = classifyNotice(dueOn, filedOn, asOf);
  return {
    id: `employment-notice-${event}`,
    employee_id: worker.employee_id,
    label: `外国人雇用状況届出（${NOTICE_EVENT_LABELS[event]} ${eventDate} · ${noticeRouteLabel(route, event)}）`,
    status,
    detail: noticeDetail(state, dueOn, filedOn, asOf),
    legal_basis: LEGAL_BASIS_NOTICE,
    event,
    event_date: eventDate,
    route,
    state,
    due_on: dueOn,
    filed_on: filedOn,
    days_until_due: daysBetween(asOf, dueOn),
  };
}

function exemptNotice(worker: ForeignWorker): NoticeAssessment {
  return {
    id: "employment-notice-hire",
    employee_id: worker.employee_id,
    label: `外国人雇用状況届出（${noticeRouteLabel("exempt", "hire")}）`,
    status: "ok",
    detail: "特別永住者 · 外交 · 公用は届出対象外（労働施策総合推進法施行規則1条の2）",
    legal_basis: LEGAL_BASIS_NOTICE,
    event: "hire",
    event_date: worker.hired_on,
    route: "exempt",
    state: "not_required",
  };
}

export function assessEmploymentNotices(worker: ForeignWorker, asOf: string): NoticeAssessment[] {
  if (EMPLOYMENT_NOTICE_EXEMPT_CODES.has(worker.status_of_residence)) return [exemptNotice(worker)];
  const hire = assessNotice(worker, "hire", worker.hired_on, worker.hello_work_hire_notified_on, asOf);
  if (!worker.separated_on) return [hire];
  const separation = assessNotice(
    worker,
    "separation",
    worker.separated_on,
    worker.hello_work_separation_notified_on,
    asOf
  );
  return [hire, separation];
}

/** 本人義務の届出（14日以内）を会社側で案内するためのリマインダ。期限経過後は表示しない。 */
export function assessSelfNotificationReminders(worker: ForeignWorker, asOf: string): CheckItem[] {
  if (!SELF_NOTIFICATION_STATUS_CODES.has(worker.status_of_residence)) return [];
  const events: ReadonlyArray<{ event: NoticeEvent; date: string }> = [
    { event: "hire", date: worker.hired_on },
    ...(worker.separated_on ? [{ event: "separation" as const, date: worker.separated_on }] : []),
  ];
  return events
    .map(({ event, date }) => ({ event, date, dueOn: addDays(date, SELF_NOTIFICATION_DAYS) }))
    .filter(({ dueOn }) => asOf <= dueOn)
    .map(({ event, date, dueOn }) => ({
      id: `self-notification-${event}`,
      employee_id: worker.employee_id,
      label: `本人の所属機関等に関する届出（${NOTICE_EVENT_LABELS[event]} ${date}）`,
      status: "notice" as const,
      detail: `本人が ${dueOn} までに出入国在留管理庁へ届出（本人義務 · 会社は案内のみ）`,
      legal_basis: LEGAL_BASIS_SELF_NOTICE,
    }));
}
