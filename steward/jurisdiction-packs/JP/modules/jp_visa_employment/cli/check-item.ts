/**
 * ok — 記録上の問題なし · notice — 期限前の準備事項 · alert — 要対応（規則該当・期限切迫/超過）·
 * needs_review — データ不足または判断を要する（人間・行政書士等が確認）
 */
export type CheckStatus = "ok" | "notice" | "alert" | "needs_review";

export interface CheckItem {
  id: string;
  employee_id?: string;
  label: string;
  status: CheckStatus;
  detail: string;
  legal_basis: string;
}

export type CheckCounts = Record<CheckStatus, number>;

const PASSING_STATUSES: ReadonlySet<CheckStatus> = new Set(["ok", "notice"]);

export const CHECK_STATUS_MARKS: Record<CheckStatus, string> = {
  ok: "✓",
  notice: "!",
  alert: "✗",
  needs_review: "?",
};

export function countStatuses(items: readonly Pick<CheckItem, "status">[]): CheckCounts {
  const counts: CheckCounts = { ok: 0, notice: 0, alert: 0, needs_review: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

export function allPassing(items: readonly Pick<CheckItem, "status">[]): boolean {
  return items.every((item) => PASSING_STATUSES.has(item.status));
}

export function jurisdictionCheck(jurisdictionCode: string): CheckItem {
  const isJapan = jurisdictionCode === "JP";
  return {
    id: "req-jp",
    label: "日本法域テナントであること",
    status: isJapan ? "ok" : "alert",
    detail: isJapan ? "JP" : `current: ${jurisdictionCode} — 本モジュールは日本法（入管法・労働施策総合推進法）専用`,
    legal_basis: "tenant.yaml jurisdiction",
  };
}
