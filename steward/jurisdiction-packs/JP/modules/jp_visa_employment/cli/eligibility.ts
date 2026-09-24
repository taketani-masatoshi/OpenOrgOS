import type {
  ForeignWorker,
  JobCategory,
  PermissionToEngage,
  StatusCatalogEntry,
  StatusCatalogFile,
  WeeklyHoursRecord,
} from "../../../../../../schemas/jp-visa-employment.js";
import type { CheckItem, CheckStatus } from "./check-item.js";
import {
  CARD_CHECK_EXEMPT_CODES,
  COMPREHENSIVE_PERMISSION_WEEKLY_LIMIT_HOURS,
  DAYS_PER_WEEK,
  SPECIFIED_SKILLED_WORKER_CODES,
  STUDENT_LONG_VACATION_DAILY_LIMIT_HOURS,
  STUDENT_STATUS_CODE,
  TECHNICAL_INTERN_CODE,
} from "./statutory.js";

const LEGAL_BASIS_WORK = "入管法19条1項 · 別表第一/第二";
const LEGAL_BASIS_HOURS = "入管法19条2項 · 施行規則19条5項1号";
const LEGAL_BASIS_CARD = "労働施策総合推進法施行規則11条 · 入管法73条の2第2項";

export interface WorkerContext {
  worker: ForeignWorker;
  status?: StatusCatalogEntry;
  jobCategory?: JobCategory;
}

export function buildWorkerContext(worker: ForeignWorker, catalog: StatusCatalogFile): WorkerContext {
  return {
    worker,
    status: catalog.statuses.find((entry) => entry.code === worker.status_of_residence),
    jobCategory: catalog.job_categories.find((category) => category.id === worker.job_category),
  };
}

/** 離職日当日までは在籍として扱う（雇入れ予定者は雇入れ前確認のため対象に含める）。 */
export function isEmployedOn(worker: ForeignWorker, asOf: string): boolean {
  return worker.separated_on === undefined || worker.separated_on >= asOf;
}

function workerItem(
  worker: ForeignWorker,
  fields: { id: string; label: string; status: CheckStatus; detail: string; legal_basis: string }
): CheckItem {
  return { ...fields, employee_id: worker.employee_id };
}

function eligibilityItem(worker: ForeignWorker, status: CheckStatus, detail: string): CheckItem {
  return workerItem(worker, {
    id: "work-eligibility",
    label: "在留資格と業務区分の就労可否",
    status,
    detail,
    legal_basis: LEGAL_BASIS_WORK,
  });
}

function evaluateActivityRestricted(worker: ForeignWorker, status: StatusCatalogEntry): CheckItem {
  const job = worker.job_category;
  if (status.excluded_job_categories.includes(job)) {
    return eligibilityItem(
      worker,
      "alert",
      `${status.name_ja} の活動範囲外の可能性（業務区分 ${job}）— 不法就労助長罪（73条の2）に注意し人間が判断`
    );
  }
  if (status.permitted_job_categories.includes(job)) {
    return eligibilityItem(worker, "ok", `${status.name_ja} — 業務区分 ${job} はカタログ上の活動範囲`);
  }
  if (worker.permission_to_engage.granted) {
    return eligibilityItem(
      worker,
      "needs_review",
      `業務区分 ${job} は ${status.name_ja} のカタログ範囲外 — 資格外活動許可（個別許可）の内容を許可書で確認`
    );
  }
  return eligibilityItem(
    worker,
    "needs_review",
    `業務区分 ${job} が ${status.name_ja} にマップされていない — 指定書・活動内容を人間/行政書士が確認`
  );
}

function evaluateNoWorkStatus(context: WorkerContext, status: StatusCatalogEntry): CheckItem {
  const { worker, jobCategory } = context;
  if (!worker.permission_to_engage.granted) {
    return eligibilityItem(worker, "alert", `${status.name_ja} は原則就労不可 — 資格外活動許可の記録なし`);
  }
  if (!jobCategory) {
    return eligibilityItem(
      worker,
      "needs_review",
      `業務区分 ${worker.job_category} がカタログにない — 風俗営業等の営業所での業務に当たらないか確認`
    );
  }
  if (jobCategory.fueiho_regulated) {
    return eligibilityItem(
      worker,
      "alert",
      `資格外活動許可では風俗営業等の営業所での就労不可（業務区分 ${jobCategory.id}）`
    );
  }
  return eligibilityItem(worker, "ok", `${status.name_ja} · 資格外活動許可あり — 時間上限は週次チェック参照`);
}

export function evaluateWorkEligibility(context: WorkerContext): CheckItem {
  const { worker, status } = context;
  if (!status) {
    return eligibilityItem(worker, "needs_review", `在留資格コード ${worker.status_of_residence} がカタログにない`);
  }
  if (status.work_allowed === "unrestricted") {
    return eligibilityItem(worker, "ok", `${status.name_ja} — 就労活動の制限なし`);
  }
  if (status.work_allowed === "restricted_to_activity") return evaluateActivityRestricted(worker, status);
  return evaluateNoWorkStatus(context, status);
}

/** 就労が資格外活動許可に依拠する（原則就労不可の在留資格、又は在留資格の範囲外の業務）。 */
export function worksUnderPermission(context: WorkerContext): boolean {
  const { worker, status } = context;
  if (!status || !worker.permission_to_engage.granted) return false;
  if (status.work_allowed === "not_allowed") return true;
  return (
    status.work_allowed === "restricted_to_activity" &&
    !status.permitted_job_categories.includes(worker.job_category)
  );
}

/** 包括許可は28時間/週を超えられない。個別許可は許可書記載の条件（未記録なら null）。 */
export function resolveWeeklyLimitHours(permission: PermissionToEngage): number | null {
  if (!permission.granted) return null;
  if (permission.scope === "comprehensive") {
    return Math.min(
      permission.weekly_limit_hours ?? COMPREHENSIVE_PERMISSION_WEEKLY_LIMIT_HOURS,
      COMPREHENSIVE_PERMISSION_WEEKLY_LIMIT_HOURS
    );
  }
  return permission.weekly_limit_hours ?? null;
}

function hoursItem(week: WeeklyHoursRecord, status: CheckStatus, detail: string): CheckItem {
  return {
    id: "permission-hours",
    employee_id: week.employee_id,
    label: `資格外活動の就労時間（週 ${week.week_start}）`,
    status,
    detail,
    legal_basis: LEGAL_BASIS_HOURS,
  };
}

function evaluateRegularWeek(week: WeeklyHoursRecord, limitHours: number | null): CheckItem {
  if (limitHours === null) {
    return hoursItem(week, "needs_review", "個別許可の時間条件が未記録 — 許可書で確認");
  }
  if (week.hours > limitHours) {
    return hoursItem(week, "alert", `当社 ${week.hours}h > 上限 ${limitHours}h/週`);
  }
  if (week.other_employer_hours === undefined) {
    return hoursItem(
      week,
      "needs_review",
      `当社 ${week.hours}h — 他の就労先の時間（本人申告）未記録。上限 ${limitHours}h/週は全就労先の合算で判定`
    );
  }
  const totalHours = week.hours + week.other_employer_hours;
  if (totalHours > limitHours) {
    return hoursItem(week, "alert", `合算 ${totalHours}h > 上限 ${limitHours}h/週`);
  }
  return hoursItem(week, "ok", `合算 ${totalHours}h ≤ 上限 ${limitHours}h/週`);
}

function evaluateLongVacationWeek(week: WeeklyHoursRecord): CheckItem {
  const dailyLimit = STUDENT_LONG_VACATION_DAILY_LIMIT_HOURS;
  const weeklyCeiling = dailyLimit * DAYS_PER_WEEK;
  if (week.hours > weeklyCeiling) {
    return hoursItem(week, "alert", `長期休業期間: 当社 ${week.hours}h/週 > ${weeklyCeiling}h — 1日${dailyLimit}時間超の日がある`);
  }
  if (week.max_daily_hours === undefined) {
    return hoursItem(week, "needs_review", `長期休業期間は1日${dailyLimit}時間以内 — 日別最大時間が未記録`);
  }
  if (week.max_daily_hours > dailyLimit) {
    return hoursItem(week, "alert", `長期休業期間: 最大 ${week.max_daily_hours}h/日 > 上限 ${dailyLimit}h/日`);
  }
  if (week.other_employer_hours === undefined || week.other_employer_hours > 0) {
    return hoursItem(week, "needs_review", "他の就労先の時間が未記録又はあり — 日別合算で上限内か確認");
  }
  return hoursItem(week, "ok", `長期休業期間: 最大 ${week.max_daily_hours}h/日 ≤ 上限 ${dailyLimit}h/日`);
}

export function evaluateWeeklyHours(input: {
  week: WeeklyHoursRecord;
  statusCode: string;
  permission: PermissionToEngage;
}): CheckItem {
  const { week, statusCode, permission } = input;
  const isStudentLongVacation =
    week.is_school_long_vacation &&
    statusCode === STUDENT_STATUS_CODE &&
    permission.scope === "comprehensive";
  if (isStudentLongVacation) return evaluateLongVacationWeek(week);
  return evaluateRegularWeek(week, resolveWeeklyLimitHours(permission));
}

export function evaluatePermissionHours(
  context: WorkerContext,
  weeks: readonly WeeklyHoursRecord[]
): CheckItem[] {
  if (!worksUnderPermission(context)) return [];
  const { worker } = context;
  const workerWeeks = weeks.filter((week) => week.employee_id === worker.employee_id);
  if (workerWeeks.length === 0) {
    return [
      workerItem(worker, {
        id: "permission-hours",
        label: "資格外活動の就労時間",
        status: "needs_review",
        detail: "週次就労時間の記録なし — weekly-hours.yaml に記録",
        legal_basis: LEGAL_BASIS_HOURS,
      }),
    ];
  }
  return workerWeeks.map((week) =>
    evaluateWeeklyHours({ week, statusCode: worker.status_of_residence, permission: worker.permission_to_engage })
  );
}

function cardItem(worker: ForeignWorker, status: CheckStatus, detail: string): CheckItem {
  return workerItem(worker, {
    id: "card-verification",
    label: "在留カード等の確認記録",
    status,
    detail,
    legal_basis: LEGAL_BASIS_CARD,
  });
}

export function evaluateCardVerification(worker: ForeignWorker, asOf: string): CheckItem {
  if (CARD_CHECK_EXEMPT_CODES.has(worker.status_of_residence)) {
    return cardItem(worker, "ok", "在留カード確認・雇用状況届出の対象外（特別永住者 · 外交/公用）");
  }
  if (!worker.card_verified_on) {
    return cardItem(worker, "alert", "在留カード等の確認記録なし — 確認を怠った過失は不法就労助長罪の処罰を免れない");
  }
  if (worker.card_valid_until && worker.card_valid_until < asOf) {
    return cardItem(worker, "alert", `在留カード有効期間 ${worker.card_valid_until} 経過 — 新しいカードを確認し記録を更新`);
  }
  if (!worker.card_verified_by) {
    return cardItem(worker, "needs_review", `確認日 ${worker.card_verified_on} · 確認者（employee_id）未記録`);
  }
  if (worker.card_verified_on > worker.hired_on) {
    return cardItem(
      worker,
      "needs_review",
      `確認日 ${worker.card_verified_on} が雇入れ日 ${worker.hired_on} より後 — 雇入れ時の確認経緯を記録`
    );
  }
  return cardItem(worker, "ok", `確認日 ${worker.card_verified_on} · 確認者 ${worker.card_verified_by}`);
}

export function evaluateStatusSpecificReview(worker: ForeignWorker): CheckItem | null {
  if (SPECIFIED_SKILLED_WORKER_CODES.has(worker.status_of_residence)) {
    return workerItem(worker, {
      id: "specified-skilled-worker-obligations",
      label: "特定技能所属機関の義務",
      status: "needs_review",
      detail:
        "特定技能雇用契約 · 1号特定技能外国人支援計画 · 分野別協議会 · 随時/定期届出 · 指定書の特定産業分野は本モジュール対象外 — 登録支援機関・行政書士と確認",
      legal_basis: "入管法2条の5 · 19条の18",
    });
  }
  if (worker.status_of_residence === TECHNICAL_INTERN_CODE) {
    return workerItem(worker, {
      id: "technical-intern-plan",
      label: "技能実習計画 · 監理団体",
      status: "needs_review",
      detail: "技能実習法の実習計画 · 監理団体は対象外。育成就労制度（令和9年4月1日施行）も対象外",
      legal_basis: "技能実習法",
    });
  }
  return null;
}

export function evaluateWorker(
  context: WorkerContext,
  weeks: readonly WeeklyHoursRecord[],
  asOf: string
): CheckItem[] {
  const review = evaluateStatusSpecificReview(context.worker);
  return [
    evaluateWorkEligibility(context),
    evaluateCardVerification(context.worker, asOf),
    ...evaluatePermissionHours(context, weeks),
    ...(review ? [review] : []),
  ];
}
