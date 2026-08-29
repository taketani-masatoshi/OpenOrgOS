import { defineCopy } from "@ops-shared/define-copy";
import type { UiLocale } from "@ops-shared/locale";

export const WALLET_OPS_COPY = defineCopy(
  {
    notFetched: "未取得",
    justNow: "たった今",
    secondsAgo: (n: number) => `${n}秒前`,
    minutesAgo: (n: number) => `${n}分前`,
    hoursAgo: (n: number) => `${n}時間前`,
    envelopeMissingTitle: "経費枠未設定",
    envelopeMissingQuestion: (name: string) =>
      `${name} への個人経費枠はまだありません。今期の裁量経費を配分しますか？`,
    envelopeMissingHint1: "予算管理 → 個人配布",
    envelopeMissingHint2: "費目と金額を決めてから再読込",
    envelopeOverTitle: "経費枠超過",
    envelopeOverSome: "一部費目",
    envelopeOverQuestion: (name: string, cats: string) =>
      `${name} の経費実績が枠を超えています（${cats}）。費目の付け替えですか、枠の増額ですか？`,
    envelopeOverHint1: "月次の category / employee_id を確認",
    envelopeOverHint2: "人件費が経費枠に混入していないか確認",
    envelopeOverHint3: "増額が必要なら個人配布から申請",
    envelopeNoActualTitle: "実績なし",
    envelopeNoActualQuestion: (name: string) =>
      `${name} に経費枠はありますが実績が 0 です。未計上の経費がありますか？`,
    envelopeNoActualHint1: "月次 YAML の allocations を確認",
    envelopeNoActualHint2: "対象月の basis が actual か確認",
    payrollNoneTitle: "人件費対象外",
    payrollNoneQuestion: (name: string) =>
      `${name} は人件費マスタの対象外です。委託費など別科目で見ますか？`,
    payrollNoneHint1: "経費枠レーンへ切替",
    payrollNoneHint2: "必要なら payroll.yaml に employee_id を追加",
    payrollUnbookedTitle: "人件費未計上",
    payrollUnbookedQuestion: (name: string) =>
      `${name} の月額は設定済みですが、実績月がありません。開始月はいつですか？`,
    payrollUnbookedHint1: "月次に category: payroll と employee_id を入れる",
    payrollUnbookedHint2:
      "対象期間内に月次ファイルがまだ無い場合は開始月を決める",
    payrollMismatchTitle: "人件費突合不一致",
    payrollOver: "計上過多",
    payrollUnder: "計上不足",
    payrollMismatchQuestion: (name: string, direction: string) =>
      `${name} の人件費がマスタと一致しません（${direction}）。マスタ改定と月次計上のどちらが正しいですか？`,
    payrollMismatchHint1: "payroll.yaml の月額を確認",
    payrollMismatchHint2: "月次 allocations[].employee_id を確認",
    payrollMismatchHint3: "期中の計上 0 円月も不一致に含む",
    payrollMismatchHint4: "CLI: orgos finances payroll reconcile",
    payrollGapsTitle: "欠月の可能性",
    payrollGapsQuestion: (name: string, holes: number) =>
      `${name} の計上期間の途中に空月が ${holes} あります。計上漏れですか？`,
    payrollGapsHint1: "タイムラインの「—」月を確認",
    payrollGapsHint2:
      "期間外・未作成の月は対象外。期中 0 円は通常不一致になる",
    companyPayrollWarnTitle: "全社人件費に差",
    companyPayrollWarnQuestion:
      "全社の人件費突合が一致していません。個人画面の前に全社側を直しますか？",
    companyPayrollWarnHint1: "予算管理 → 人件費",
    companyPayrollWarnHint2: "orgos finances payroll reconcile",
    actualsLagTitle: "実績の鮮度",
    actualsLagQuestion: (month: string) =>
      `月次実績の最終月が ${month} です。当月までの計上は済みですか？`,
    actualsLagHint1: "data/finance/monthly/ を更新",
    actualsLagHint2: "更新後に画面を再読込",
    companyUnbookedTitle: "全社人件費未計上",
    companyUnbookedQuestion:
      "マスタ月額はありますが実績月がありません。いつから計上しますか？",
    companyUnbookedHint1: "monthly/*.yaml に category: payroll",
    companyUnbookedHint2:
      "対象期間内に月次ファイルが無い場合は開始月を決める（期中 0 円は不一致）",
    companyMismatchTitle: "全社人件費不一致",
    companyMismatchQuestion: (diff: string) =>
      `期待と計上に差があります（差額 ${diff}）。マスタと月次のどちらを正としますか？`,
    companyMismatchHint1: "orgos finances payroll reconcile",
    companyMismatchHint2: "空月（未計上）も一致判定に含む",
    companyMismatchHint3: "officers[].employee_id を確認",
    companyGapsTitle: "空月あり",
    companyGapsQuestion: (n: number) =>
      `実績に空月が ${n} あります。欠月漏れですか？`,
    companyGapsHint1: "タイムラインの「—」を確認",
    companyGapsHint2: "通常は不一致として先に出ます",
    catJoin: "・",
  },
  {
    notFetched: "Not fetched",
    justNow: "just now",
    secondsAgo: (n: number) => `${n}s ago`,
    minutesAgo: (n: number) => `${n}m ago`,
    hoursAgo: (n: number) => `${n}h ago`,
    envelopeMissingTitle: "No expense envelope",
    envelopeMissingQuestion: (name: string) =>
      `${name} has no personal expense envelope yet. Allocate discretionary spend for this period?`,
    envelopeMissingHint1: "Budget admin → People",
    envelopeMissingHint2: "Set categories and amounts, then reload",
    envelopeOverTitle: "Envelope exceeded",
    envelopeOverSome: "some categories",
    envelopeOverQuestion: (name: string, cats: string) =>
      `${name}'s actuals exceed the envelope (${cats}). Reclassify, or increase the envelope?`,
    envelopeOverHint1: "Check monthly category / employee_id",
    envelopeOverHint2: "Confirm payroll is not in the expense envelope",
    envelopeOverHint3: "Request an increase from People if needed",
    envelopeNoActualTitle: "No actuals",
    envelopeNoActualQuestion: (name: string) =>
      `${name} has an envelope but 0 actuals. Are expenses unbooked?`,
    envelopeNoActualHint1: "Check allocations in monthly YAML",
    envelopeNoActualHint2: "Confirm the month basis is actual",
    payrollNoneTitle: "Not on payroll",
    payrollNoneQuestion: (name: string) =>
      `${name} is not on the payroll master. Track as contractor or another account?`,
    payrollNoneHint1: "Switch to the expense-envelope lane",
    payrollNoneHint2: "Add employee_id to payroll.yaml if needed",
    payrollUnbookedTitle: "Payroll not booked",
    payrollUnbookedQuestion: (name: string) =>
      `${name} has a monthly amount but no actual months. When does booking start?`,
    payrollUnbookedHint1: "Add category: payroll and employee_id to monthly files",
    payrollUnbookedHint2:
      "If monthly files are missing in the period, set the start month",
    payrollMismatchTitle: "Payroll mismatch",
    payrollOver: "over-booked",
    payrollUnder: "under-booked",
    payrollMismatchQuestion: (name: string, direction: string) =>
      `${name}'s payroll does not match the master (${direction}). Which is correct — the master or monthly booking?`,
    payrollMismatchHint1: "Check monthly amount in payroll.yaml",
    payrollMismatchHint2: "Check monthly allocations[].employee_id",
    payrollMismatchHint3: "Zero-yen months in-period also count as mismatch",
    payrollMismatchHint4: "CLI: orgos finances payroll reconcile",
    payrollGapsTitle: "Possible missing months",
    payrollGapsQuestion: (name: string, holes: number) =>
      `${name} has ${holes} empty month(s) in the booked range. Missing bookings?`,
    payrollGapsHint1: "Check “—” months on the timeline",
    payrollGapsHint2:
      "Months outside the period or not created yet are out of scope. In-period 0 yen is usually a mismatch",
    companyPayrollWarnTitle: "Company payroll gap",
    companyPayrollWarnQuestion:
      "Company payroll does not reconcile. Fix the company side before the personal view?",
    companyPayrollWarnHint1: "Budget admin → Payroll",
    companyPayrollWarnHint2: "orgos finances payroll reconcile",
    actualsLagTitle: "Actuals freshness",
    actualsLagQuestion: (month: string) =>
      `The latest actuals month is ${month}. Is booking complete through this month?`,
    actualsLagHint1: "Update data/finance/monthly/",
    actualsLagHint2: "Reload the screen after updating",
    companyUnbookedTitle: "Company payroll not booked",
    companyUnbookedQuestion:
      "The master has a monthly amount but there are no actual months. When should booking start?",
    companyUnbookedHint1: "Add category: payroll to monthly/*.yaml",
    companyUnbookedHint2:
      "If monthly files are missing in the period, set the start month (in-period 0 yen is a mismatch)",
    companyMismatchTitle: "Company payroll mismatch",
    companyMismatchQuestion: (diff: string) =>
      `Expected and booked amounts differ (variance ${diff}). Which is canonical — the master or monthly files?`,
    companyMismatchHint1: "orgos finances payroll reconcile",
    companyMismatchHint2: "Empty (unbooked) months count in the match",
    companyMismatchHint3: "Check officers[].employee_id",
    companyGapsTitle: "Empty months",
    companyGapsQuestion: (n: number) =>
      `Actuals have ${n} empty month(s). Missing bookings?`,
    companyGapsHint1: "Check “—” on the timeline",
    companyGapsHint2: "This usually surfaces first as a mismatch",
    catJoin: ", ",
  },
);

export function walletOpsCopy(locale: UiLocale = "ja") {
  return WALLET_OPS_COPY[locale];
}
