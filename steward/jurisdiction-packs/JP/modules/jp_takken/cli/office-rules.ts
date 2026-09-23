import type { TakkenOffice, TakkenSettings } from "../../../../../../schemas/jp-takken.js";
import type { TakkenCheckItem, TakkenVerdict } from "./check-item.js";

/** 宅地建物取引業法施行規則第18条第3項 — 帳簿は各事業年度末日に閉鎖し閉鎖後5年間保存 */
export const LEDGER_RETENTION_YEARS = 5;
/** 同項括弧書 — 宅建業者が自ら売主となる新築住宅に係る帳簿は10年間保存 */
export const LEDGER_RETENTION_YEARS_SELF_SOLD_NEW_HOUSING = 10;
/** 宅地建物取引業法施行規則第17条の2第4項 — 従業者名簿は最終の記載をした日から10年間保存 */
export const EMPLOYEE_REGISTER_RETENTION_YEARS = 10;

type OfficeRecordField =
  | "sign_posted"
  | "fee_table_posted"
  | "ledger_kept"
  | "employee_register_kept"
  | "employee_certificates_issued";

interface OfficeRecordRule {
  field: OfficeRecordField;
  id: string;
  label: string;
  article: string;
}

export const OFFICE_RECORD_RULES: readonly OfficeRecordRule[] = [
  { field: "sign_posted", id: "sign", label: "標識の掲示", article: "法第50条第1項 · 施行規則第19条" },
  { field: "fee_table_posted", id: "fee-table", label: "報酬額の掲示", article: "法第46条第4項" },
  { field: "ledger_kept", id: "ledger", label: "帳簿の備付け（取引のつど記載）", article: "法第49条 · 施行規則第18条" },
  { field: "employee_register_kept", id: "employee-register", label: "従業者名簿の備付け", article: "法第48条第3項" },
  {
    field: "employee_certificates_issued",
    id: "employee-certificate",
    label: "従業者証明書の携帯",
    article: "法第48条第1項",
  },
];

function recordFlagVerdict(value: boolean | undefined): TakkenVerdict {
  if (value === undefined) return { status: "needs_review", detail: "未記録 — 事務所で確認" };
  return value ? { status: "ok", detail: "記録上 実施" } : { status: "fail", detail: "記録上 未実施" };
}

export function evaluateOfficeRecords(office: TakkenOffice): TakkenCheckItem[] {
  return OFFICE_RECORD_RULES.map((rule) => ({
    id: `office-${office.office_id}-${rule.id}`,
    label: `${rule.label} — ${office.name}`,
    article: rule.article,
    ...recordFlagVerdict(office[rule.field]),
  }));
}

export function requiredLedgerRetentionYears(settings: TakkenSettings): number {
  return settings.self_seller_new_housing ? LEDGER_RETENTION_YEARS_SELF_SOLD_NEW_HOUSING : LEDGER_RETENTION_YEARS;
}

function retentionVerdict(configuredYears: number | undefined, requiredYears: number): TakkenVerdict {
  if (configuredYears === undefined) {
    return { status: "needs_review", detail: `保存年数 未設定 — 必要 ${requiredYears} 年` };
  }
  return configuredYears >= requiredYears
    ? { status: "ok", detail: `${configuredYears} 年 ≥ ${requiredYears} 年` }
    : { status: "fail", detail: `${configuredYears} 年 < 必要 ${requiredYears} 年` };
}

export function evaluateRetentionPolicy(settings: TakkenSettings): TakkenCheckItem[] {
  const ledgerYears = requiredLedgerRetentionYears(settings);
  return [
    {
      id: "retention-ledger",
      label: "帳簿の保存期間（閉鎖後）",
      article: "施行規則第18条第3項",
      ...retentionVerdict(settings.ledger_retention_years, ledgerYears),
    },
    {
      id: "retention-employee-register",
      label: "従業者名簿の保存期間（最終記載日から）",
      article: "施行規則第17条の2第4項",
      ...retentionVerdict(settings.employee_register_retention_years, EMPLOYEE_REGISTER_RETENTION_YEARS),
    },
  ];
}

export function evaluateOfficeChecks(
  offices: readonly TakkenOffice[],
  settings: TakkenSettings
): TakkenCheckItem[] {
  return [...offices.flatMap(evaluateOfficeRecords), ...evaluateRetentionPolicy(settings)];
}
