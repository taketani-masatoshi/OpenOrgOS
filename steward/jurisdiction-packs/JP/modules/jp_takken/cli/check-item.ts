/**
 * ok — 記録上の問題なし（適法性の保証ではない） · warn — 期限接近・未実施（期限内）
 * fail — 記録上の不備・期限超過 · needs_review — データ不足または未実装の特例で人間確認が必要
 */
export type TakkenCheckStatus = "ok" | "warn" | "fail" | "needs_review";

export interface TakkenCheckItem {
  id: string;
  label: string;
  status: TakkenCheckStatus;
  article: string;
  detail: string;
}

export type TakkenVerdict = Pick<TakkenCheckItem, "status" | "detail">;

const STATUS_SEVERITY: Record<TakkenCheckStatus, number> = {
  ok: 0,
  warn: 1,
  needs_review: 2,
  fail: 3,
};

export function worstStatus(statuses: readonly TakkenCheckStatus[]): TakkenCheckStatus {
  return statuses.reduce<TakkenCheckStatus>(
    (worst, status) => (STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst),
    "ok"
  );
}

export function countByStatus(items: readonly TakkenCheckItem[]): Record<TakkenCheckStatus, number> {
  const counts: Record<TakkenCheckStatus, number> = { ok: 0, warn: 0, needs_review: 0, fail: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

export const STATUS_MARK: Record<TakkenCheckStatus, string> = {
  ok: "✓",
  warn: "!",
  needs_review: "?",
  fail: "✗",
};

export function jurisdictionCheck(jurisdictionCode: string): TakkenCheckItem {
  const isJapan = jurisdictionCode === "JP";
  return {
    id: "req-jp",
    label: "日本法域テナントであること",
    status: isJapan ? "ok" : "fail",
    article: "宅地建物取引業法（日本法）",
    detail: isJapan ? "JP" : `current: ${jurisdictionCode} — jp_takken は JP 法域専用`,
  };
}
