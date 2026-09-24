import type { WorkAllowance } from "../../../../../../schemas/jp-visa-employment.js";

export const MODULE_ID = "jp_visa_employment";

/** 入管法 別表第二（永住者 · 日本人の配偶者等 · 永住者の配偶者等 · 定住者）— 活動に制限なし */
export const STATUS_TABLE_2_CODES = [
  "permanent_resident",
  "spouse_of_japanese_national",
  "spouse_of_permanent_resident",
  "long_term_resident",
] as const;

/** 入管特例法（平成3年法律第71号）の特別永住者 — 入管法19条の活動制限を受けない */
export const SPECIAL_PERMANENT_RESIDENT_CODE = "special_permanent_resident";

/** 入管法19条1項1号 — 別表第一の一・二・五の表: 在留資格に応じた活動の範囲内のみ就労可 */
export const ACTIVITY_RESTRICTED_STATUS_CODES = [
  "diplomat",
  "official",
  "professor",
  "artist",
  "religious_activities",
  "journalist",
  "highly_skilled_professional",
  "business_manager",
  "legal_accounting_services",
  "medical_services",
  "researcher",
  "instructor",
  "engineer_humanities_international_services",
  "intra_company_transferee",
  "nursing_care",
  "entertainer",
  "skilled_labor",
  "specified_skilled_worker_i",
  "specified_skilled_worker_ii",
  "technical_intern_training",
  "designated_activities",
] as const;

/** 入管法19条1項2号 — 別表第一の三・四の表: 資格外活動許可（19条2項）なしに報酬を受ける活動不可 */
export const NO_WORK_STATUS_CODES = [
  "cultural_activities",
  "temporary_visitor",
  "student",
  "trainee",
  "dependent",
] as const;

export const STUDENT_STATUS_CODE = "student";

/** 入管法施行規則19条5項1号 — 包括許可は1週について28時間以内 */
export const COMPREHENSIVE_PERMISSION_WEEKLY_LIMIT_HOURS = 28;

/** 同号かっこ書 — 留学生は在籍教育機関の学則上の長期休業期間中、1日について8時間以内 */
export const STUDENT_LONG_VACATION_DAILY_LIMIT_HOURS = 8;

export const DAYS_PER_WEEK = 7;

/** 永住者（在留期間 無期限）· 特別永住者（在留期間なし） */
export const NO_PERIOD_OF_STAY_CODES: ReadonlySet<string> = new Set([
  "permanent_resident",
  SPECIAL_PERMANENT_RESIDENT_CODE,
]);

/** 労働施策総合推進法施行規則1条の2 — 外国人の範囲から除かれる者（外交 · 公用 · 特別永住者）→ 雇用状況届出の対象外 */
export const EMPLOYMENT_NOTICE_EXEMPT_CODES: ReadonlySet<string> = new Set([
  "diplomat",
  "official",
  SPECIAL_PERMANENT_RESIDENT_CODE,
]);

/** 在留カード等の確認を要しない（特別永住者証明書 · 外交/公用は中長期在留者でない） */
export const CARD_CHECK_EXEMPT_CODES: ReadonlySet<string> = EMPLOYMENT_NOTICE_EXEMPT_CODES;

/**
 * 入管法19条の16第1号・第2号 — 中長期在留者本人の活動機関・契約機関に関する届出（14日以内 · 本人義務）。
 * 留学 · 研修は所属機関が教育機関等のため、雇用主側リマインダ対象から除外。
 */
export const SELF_NOTIFICATION_STATUS_CODES: ReadonlySet<string> = new Set([
  "professor",
  "highly_skilled_professional",
  "business_manager",
  "legal_accounting_services",
  "medical_services",
  "instructor",
  "intra_company_transferee",
  "technical_intern_training",
  "researcher",
  "engineer_humanities_international_services",
  "nursing_care",
  "entertainer",
  "skilled_labor",
  "specified_skilled_worker_i",
  "specified_skilled_worker_ii",
]);

/** 入管法19条の16 — 事由が生じた日から14日以内 */
export const SELF_NOTIFICATION_DAYS = 14;

/** 特定技能所属機関の義務（入管法2条の5 · 19条の18 · 支援計画 · 分野別協議会）— 本モジュールは判定しない */
export const SPECIFIED_SKILLED_WORKER_CODES: ReadonlySet<string> = new Set([
  "specified_skilled_worker_i",
  "specified_skilled_worker_ii",
]);

/** 技能実習法の実習計画 · 監理団体、および育成就労制度（令和9年4月1日施行）は本モジュール対象外 */
export const TECHNICAL_INTERN_CODE = "technical_intern_training";

/** 入管法19条1項各号の区分を在留資格コードから導く（カタログの work_allowed と照合する正本） */
export function statutoryWorkAllowance(statusCode: string): WorkAllowance | null {
  if (statusCode === SPECIAL_PERMANENT_RESIDENT_CODE) return "unrestricted";
  if ((STATUS_TABLE_2_CODES as readonly string[]).includes(statusCode)) return "unrestricted";
  if ((ACTIVITY_RESTRICTED_STATUS_CODES as readonly string[]).includes(statusCode)) {
    return "restricted_to_activity";
  }
  if ((NO_WORK_STATUS_CODES as readonly string[]).includes(statusCode)) return "not_allowed";
  return null;
}

export const ILLEGAL_EMPLOYMENT_ADVISORIES: readonly string[] = [
  "不法就労助長罪（入管法73条の2第1項）: 事業活動に関し外国人に不法就労活動をさせた者は処罰対象（取得日時点の e-Gov 条文: 3年以下の拘禁刑若しくは300万円以下の罰金又は併科。改正の施行状況は e-Gov で確認）。",
  "在留資格の活動範囲外であること · 資格外活動許可がないこと等を知らなかったことを理由に処罰を免れない（同条2項）。過失がない場合を除く — 在留カード等の確認を記録する。",
  "外国人雇用状況の届出をせず、又は虚偽の届出をした者は30万円以下の罰金（労働施策総合推進法40条1項2号）。",
  "本出力は準備・確認支援であり法令適合を保証しない。雇用可否 · 在留手続の最終判断と行政への提出は人間（担当者 · 行政書士等）が行う。",
];
