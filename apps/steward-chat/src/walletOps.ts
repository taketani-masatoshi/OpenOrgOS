/**
 * Deterministic ops helpers for personal budget / payroll UX.
 * No LLM — questions are generated from payload state only.
 */

export type OpsPromptSeverity = "info" | "warn" | "critical";

export type OpsPrompt = {
  id: string;
  severity: OpsPromptSeverity;
  title: string;
  question: string;
  hints: string[];
};

export type WalletOpsInput = {
  lane: "envelope" | "payroll";
  person_id: string;
  display_name: string;
  envelope?: {
    allocation_yen: number;
    actual_yen: number;
    remaining_yen: number;
    over_categories: string[];
  } | null;
  payroll?: {
    kind: "officer" | "employee" | "none";
    expected_monthly_yen: number;
    actual_months: number;
    empty_actual_months: number;
    actual_booked_yen: number;
    actual_expected_yen: number;
    actual_variance_yen: number;
    ok: boolean;
    /** actual months in order; used to detect mid-series holes vs leading empty. */
    months?: Array<{ month: string; booked_yen: number; basis?: string }>;
  } | null;
  company_payroll_ok?: boolean;
  actual_as_of?: string | null;
  /** ISO month YYYY-MM for “today” in tenant calendar (testable). */
  now_month?: string;
};

export const STALE_SOFT_MS = 60_000;
export const STALE_HARD_MS = 5 * 60_000;

export function isFetchStale(
  fetchedAtMs: number | null,
  nowMs = Date.now(),
): "fresh" | "soft" | "hard" {
  if (fetchedAtMs == null) return "hard";
  const age = nowMs - fetchedAtMs;
  if (age >= STALE_HARD_MS) return "hard";
  if (age >= STALE_SOFT_MS) return "soft";
  return "fresh";
}

/**
 * Whether a visible tab should soft-reload on the poll tick.
 * Always true when soft/hard stale; also true on interval while visible
 * so long-lived tabs do not keep stale "fresh" data forever.
 */
export function shouldPollReloadWhileVisible(
  fetchedAtMs: number | null,
  nowMs = Date.now(),
  minAgeMs = 30_000,
): boolean {
  if (fetchedAtMs == null) return true;
  return nowMs - fetchedAtMs >= minAgeMs;
}

export function formatFetchedLabel(
  fetchedAtMs: number | null,
  nowMs = Date.now(),
): string {
  if (fetchedAtMs == null) return "未取得";
  const ageSec = Math.max(0, Math.round((nowMs - fetchedAtMs) / 1000));
  if (ageSec < 15) return "たった今";
  if (ageSec < 60) return `${ageSec}秒前`;
  const ageMin = Math.round(ageSec / 60);
  if (ageMin < 60) return `${ageMin}分前`;
  return `${Math.round(ageMin / 60)}時間前`;
}

function currentMonth(nowMonth?: string): string {
  if (nowMonth) return nowMonth;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** True when actual_as_of is more than one calendar month behind now_month. */
export function isActualAsOfLagging(
  actualAsOf: string | null | undefined,
  nowMonth?: string,
): boolean {
  if (!actualAsOf || !/^\d{4}-\d{2}$/.test(actualAsOf)) return false;
  const now = currentMonth(nowMonth);
  const [ay, am] = actualAsOf.split("-").map(Number);
  const [ny, nm] = now.split("-").map(Number);
  return ny * 12 + nm - (ay * 12 + am) >= 2;
}

export function buildWalletOpsPrompts(input: WalletOpsInput): OpsPrompt[] {
  const prompts: OpsPrompt[] = [];
  const name = input.display_name || input.person_id;

  if (input.lane === "envelope") {
    if (!input.envelope) {
      prompts.push({
        id: "envelope-missing",
        severity: "info",
        title: "経費枠未設定",
        question: `${name} への個人経費枠はまだありません。今期の裁量経費を配分しますか？`,
        hints: ["予算管理 → 個人配布", "費目と金額を決めてから再読込"],
      });
    } else if (input.envelope.remaining_yen < 0) {
      const cats =
        input.envelope.over_categories.length > 0
          ? input.envelope.over_categories.join("・")
          : "一部費目";
      prompts.push({
        id: "envelope-over",
        severity: "critical",
        title: "経費枠超過",
        question: `${name} の経費実績が枠を超えています（${cats}）。費目の付け替えですか、枠の増額ですか？`,
        hints: [
          "月次の category / employee_id を確認",
          "人件費が経費枠に混入していないか確認",
          "増額が必要なら個人配布から申請",
        ],
      });
    } else if (
      input.envelope.allocation_yen > 0 &&
      input.envelope.actual_yen === 0
    ) {
      prompts.push({
        id: "envelope-no-actual",
        severity: "info",
        title: "実績なし",
        question: `${name} に経費枠はありますが実績が 0 です。未計上の経費がありますか？`,
        hints: ["月次 YAML の allocations を確認", "対象月の basis が actual か確認"],
      });
    }
  }

  if (input.lane === "payroll") {
    const p = input.payroll;
    if (!p || p.kind === "none") {
      prompts.push({
        id: "payroll-none",
        severity: "info",
        title: "人件費対象外",
        question: `${name} は人件費マスタの対象外です。委託費など別科目で見ますか？`,
        hints: ["経費枠レーンへ切替", "必要なら payroll.yaml に employee_id を追加"],
      });
    } else if (
      p.expected_monthly_yen > 0 &&
      p.actual_months === 0
    ) {
      prompts.push({
        id: "payroll-unbooked",
        severity: "warn",
        title: "人件費未計上",
        question: `${name} の月額は設定済みですが、実績月がありません。開始月はいつですか？`,
        hints: [
          "月次に category: payroll と employee_id を入れる",
          "対象期間内に月次ファイルがまだ無い場合は開始月を決める",
        ],
      });
    } else if (!p.ok && p.actual_months > 0) {
      const direction =
        p.actual_variance_yen > 0 ? "計上過多" : "計上不足";
      prompts.push({
        id: "payroll-mismatch",
        severity: "warn",
        title: "人件費突合不一致",
        question: `${name} の人件費がマスタと一致しません（${direction}）。マスタ改定と月次計上のどちらが正しいですか？`,
        hints: [
          "payroll.yaml の月額を確認",
          "月次 allocations[].employee_id を確認",
          "期中の計上 0 円月も不一致に含む",
          "CLI: orgos finances payroll reconcile",
        ],
      });
    } else if (
      p.expected_monthly_yen > 0 &&
      countMidSeriesEmptyMonths(p.months) > 0
    ) {
      const holes = countMidSeriesEmptyMonths(p.months);
      prompts.push({
        id: "payroll-gaps",
        severity: "info",
        title: "欠月の可能性",
        question: `${name} の計上期間の途中に空月が ${holes} あります。計上漏れですか？`,
        hints: [
          "タイムラインの「—」月を確認",
          "期間外・未作成の月は対象外。期中 0 円は通常不一致になる",
        ],
      });
    }
  }

  if (input.company_payroll_ok === false) {
    prompts.push({
      id: "company-payroll-warn",
      severity: "warn",
      title: "全社人件費に差",
      question: "全社の人件費突合が一致していません。個人画面の前に全社側を直しますか？",
      hints: ["予算管理 → 人件費", "orgos finances payroll reconcile"],
    });
  }

  if (isActualAsOfLagging(input.actual_as_of, input.now_month)) {
    prompts.push({
      id: "actuals-lag",
      severity: "warn",
      title: "実績の鮮度",
      question: `月次実績の最終月が ${input.actual_as_of} です。当月までの計上は済みですか？`,
      hints: ["data/finance/monthly/ を更新", "更新後に画面を再読込"],
    });
  }

  // Cap to keep the rail scannable.
  return prompts.slice(0, 3);
}

/** Empty months between first and last booked actual month. */
export function countMidSeriesEmptyMonths(
  months?: Array<{ month: string; booked_yen: number; basis?: string }>,
): number {
  if (!months?.length) return 0;
  const actual = months
    .filter((m) => !m.basis || m.basis === "actual")
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month));
  const first = actual.findIndex((m) => m.booked_yen > 0);
  const last = (() => {
    for (let i = actual.length - 1; i >= 0; i -= 1) {
      if (actual[i]!.booked_yen > 0) return i;
    }
    return -1;
  })();
  if (first < 0 || last < 0 || last <= first) return 0;
  let holes = 0;
  for (let i = first + 1; i < last; i += 1) {
    if (actual[i]!.booked_yen === 0) holes += 1;
  }
  return holes;
}

export function buildCompanyPayrollPrompts(input: {
  ok: boolean;
  expected_monthly_yen: number;
  actual_months: number;
  empty_actual_months: number;
  actual_variance_yen: number;
  actual_as_of?: string | null;
  now_month?: string;
}): OpsPrompt[] {
  const prompts: OpsPrompt[] = [];
  if (input.expected_monthly_yen > 0 && input.actual_months === 0) {
    prompts.push({
      id: "company-unbooked",
      severity: "warn",
      title: "全社人件費未計上",
      question: "マスタ月額はありますが実績月がありません。いつから計上しますか？",
      hints: [
        "monthly/*.yaml に category: payroll",
        "対象期間内に月次ファイルが無い場合は開始月を決める（期中 0 円は不一致）",
      ],
    });
  } else if (!input.ok && input.actual_months > 0) {
    prompts.push({
      id: "company-mismatch",
      severity: "warn",
      title: "全社人件費不一致",
      question: `期待と計上に差があります（差額 ¥${Math.round(input.actual_variance_yen).toLocaleString("ja-JP")}）。マスタと月次のどちらを正としますか？`,
      hints: [
        "orgos finances payroll reconcile",
        "空月（未計上）も一致判定に含む",
        "officers[].employee_id を確認",
      ],
    });
  } else if (input.empty_actual_months > 0 && input.expected_monthly_yen > 0) {
    // Rare when ok:true — empty months with expected>0 normally surface as mismatch (P2).
    prompts.push({
      id: "company-gaps",
      severity: "info",
      title: "空月あり",
      question: `実績に空月が ${input.empty_actual_months} あります。欠月漏れですか？`,
      hints: ["タイムラインの「—」を確認", "通常は不一致として先に出ます"],
    });
  }
  if (isActualAsOfLagging(input.actual_as_of, input.now_month)) {
    prompts.push({
      id: "actuals-lag",
      severity: "warn",
      title: "実績の鮮度",
      question: `月次実績の最終月が ${input.actual_as_of} です。当月までの計上は済みですか？`,
      hints: ["data/finance/monthly/ を更新"],
    });
  }
  return prompts.slice(0, 3);
}
