import type {
  LaborWage,
  MinimumWageRate,
  MinimumWagesFile,
} from "../../../../../../schemas/jp-labor-contract.js";
import type { CheckItem } from "./checks.js";

export const JP_PREFECTURES: readonly string[] = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

const MINIMUM_WAGE_BASIS = "最低賃金法4条・9条 · 同施行規則1条・2条";

export type HourlyWageResult =
  { kind: "hourly"; hourlyYen: number } | { kind: "needs_review"; reason: string };

function scheduledHours(wage: LaborWage): number | undefined {
  switch (wage.unit) {
    case "daily":
      return wage.daily_scheduled_hours;
    case "weekly":
      return wage.weekly_scheduled_hours;
    case "monthly":
      return wage.monthly_average_scheduled_hours;
    default:
      return undefined;
  }
}

/** 最賃法施行規則2条1項: 日給・週給・月給を所定労働時間数で除して時間額に換算する。 */
export function toHourlyWage(wage: LaborWage): HourlyWageResult {
  const amount = wage.base_amount + wage.minimum_wage_eligible_allowances;
  if (wage.unit === "hourly") return { kind: "hourly", hourlyYen: amount };
  if (wage.unit === "piece_rate") {
    return {
      kind: "needs_review",
      reason: "出来高払制 — 賃金算定期間の総額÷総労働時間で人間が換算（施行規則2条1項5号）",
    };
  }
  const hours = scheduledHours(wage);
  if (!hours) return { kind: "needs_review", reason: `${wage.unit} の所定労働時間数が未設定` };
  return { kind: "hourly", hourlyYen: amount / hours };
}

/** Latest regional minimum wage in force on `onDate`, or null when the table has none. */
export function findMinimumWage(
  rates: readonly MinimumWageRate[],
  prefecture: string,
  onDate: string
): MinimumWageRate | null {
  const inForce = rates
    .filter((rate) => rate.prefecture === prefecture && rate.effective_from <= onDate)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return inForce[0] ?? null;
}

export interface MinimumWageInput {
  wage: LaborWage;
  prefecture: string;
  onDate: string;
  table: MinimumWagesFile;
}

function wageItem(status: CheckItem["status"], detail: string): CheckItem {
  return {
    id: "minimum-wage",
    label: "地域別最低賃金以上",
    status,
    detail,
    basis: MINIMUM_WAGE_BASIS,
  };
}

/** Detail text never includes the employee's own wage (L2); only the statutory rate. */
export function assessMinimumWage(input: MinimumWageInput): CheckItem {
  const { wage, prefecture, onDate, table } = input;
  if (onDate > table.verified_through) {
    return wageItem(
      "needs_review",
      `判定日 ${onDate} は最低賃金表の確認期限 ${table.verified_through} 後 — 最新改定を確認`
    );
  }
  const rate = findMinimumWage(table.rates, prefecture, onDate);
  if (!rate)
    return wageItem("needs_review", `${prefecture} の ${onDate} 時点の地域別最低賃金が表にない`);
  const hourly = toHourlyWage(wage);
  if (hourly.kind === "needs_review") return wageItem("needs_review", hourly.reason);
  const reference = `${prefecture} ${rate.hourly_yen}円（${rate.effective_from} 発効）`;
  if (hourly.hourlyYen < rate.hourly_yen)
    return wageItem("ng", `時間額換算が ${reference} を下回る`);
  return wageItem("ok", `時間額換算が ${reference} 以上`);
}
