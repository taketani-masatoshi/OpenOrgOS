export type CheckStatus = "ok" | "ng" | "needs_review" | "not_applicable";

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  basis: string;
}

export type OverallStatus = "ok" | "ng" | "needs_review";

export function summarizeStatus(checks: readonly CheckItem[]): OverallStatus {
  if (checks.some((c) => c.status === "ng")) return "ng";
  if (checks.some((c) => c.status === "needs_review")) return "needs_review";
  return "ok";
}

export const STATUS_MARKS: Record<CheckStatus, string> = {
  ok: "✓",
  ng: "✗",
  needs_review: "?",
  not_applicable: "-",
};

export function jurisdictionCheck(jurisdictionCode: string): CheckItem {
  const isJapan = jurisdictionCode === "JP";
  return {
    id: "req-jp",
    label: "日本法域テナントであること",
    status: isJapan ? "ok" : "ng",
    detail: isJapan ? "JP" : `current: ${jurisdictionCode}`,
    basis: "tenant.yaml jurisdiction",
  };
}
