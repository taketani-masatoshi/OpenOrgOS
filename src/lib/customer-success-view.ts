/**
 * Executive L1 customer success view (health, renewal windows, scores, NPS, QBR).
 */
import type {
  CustomerAccount,
  CustomerHealthStatus,
  CustomerOnboarding,
} from "../../schemas/customer-success/index.js";
import {
  loadCompany,
  loadCustomerAccounts,
  loadCustomerChurnEvents,
  loadCustomerHealthSignals,
  loadCustomerNps,
  loadCustomerOnboarding,
  loadCustomerQbr,
} from "./data.js";
import {
  computeAccountHealth,
  latestByAccountId,
  onboardingByAccountId,
  type AccountHealthResult,
} from "./customer-success/health-score.js";
import { loadHealthRubric } from "./customer-success/health-rubric.js";
import { excludeDemo } from "./demo-filter.js";
import { currentDate, daysBetween } from "./utils.js";

const DEFAULT_RENEWAL_HORIZON_DAYS = 90;
const DEFAULT_QBR_HORIZON_DAYS = 30;

export interface CustomerSuccessNpsSummary {
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  nps: number | null;
}

export interface CustomerSuccessView {
  company_name: string;
  as_of: string;
  horizon_days: number;
  include_demo: boolean;
  total_accounts: number;
  by_health: Record<CustomerHealthStatus, number>;
  renewal_alerts: Array<{
    account_id: string;
    company: string;
    renewal_date: string;
    days_remaining: number;
    health: CustomerHealthStatus;
  }>;
  scored: AccountHealthResult[];
  drift_count: number;
  onboarding_overdue: Array<{
    account_id: string;
    company: string;
    onboarding_id: string;
    milestone_key: string;
    days_overdue: number;
  }>;
  qbr_due: Array<{
    account_id: string;
    company: string;
    qbr_id: string;
    next_due: string;
    days_remaining: number;
  }>;
  nps: CustomerSuccessNpsSummary;
  churn_90d: number;
  notes: string[];
}

function filterAccounts(
  accounts: CustomerAccount[],
  includeDemo: boolean,
): CustomerAccount[] {
  const lifecycleFiltered = accounts.filter(
    (a) => (a.lifecycle ?? "customer") === "customer",
  );
  return excludeDemo(lifecycleFiltered, includeDemo);
}

function collectOnboardingOverdue(
  accounts: CustomerAccount[],
  onboardings: CustomerOnboarding[],
  asOf: string,
): CustomerSuccessView["onboarding_overdue"] {
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const byAccount = onboardingByAccountId(onboardings);
  const result: CustomerSuccessView["onboarding_overdue"] = [];

  for (const [accountId, onboarding] of byAccount) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    for (const m of onboarding.milestones) {
      if (m.status === "done") continue;
      const overdue = daysBetween(m.due, asOf);
      if (overdue > 0) {
        result.push({
          account_id: accountId,
          company: account.company,
          onboarding_id: onboarding.id,
          milestone_key: m.key,
          days_overdue: overdue,
        });
      }
    }
  }
  result.sort((a, b) => b.days_overdue - a.days_overdue);
  return result;
}

function collectQbrDue(
  accounts: CustomerAccount[],
  asOf: string,
  horizonDays: number,
): CustomerSuccessView["qbr_due"] {
  const qbrFile = loadCustomerQbr();
  if (!qbrFile) return [];
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const result: CustomerSuccessView["qbr_due"] = [];

  for (const q of qbrFile.qbrs) {
    if (!q.next_due) continue;
    const account = accountMap.get(q.account_id);
    if (!account) continue;
    const remaining = daysBetween(asOf, q.next_due);
    if (remaining >= 0 && remaining <= horizonDays) {
      result.push({
        account_id: q.account_id,
        company: account.company,
        qbr_id: q.id,
        next_due: q.next_due,
        days_remaining: remaining,
      });
    }
  }
  result.sort((a, b) => a.days_remaining - b.days_remaining);
  return result;
}

function summarizeNps(
  accountIds: Set<string>,
  includeDemo: boolean,
  allAccounts: CustomerAccount[],
): CustomerSuccessNpsSummary {
  const npsFile = loadCustomerNps();
  const demoIds = new Set(
    allAccounts.filter((a) => a.demo === true).map((a) => a.id),
  );
  const responses = (npsFile?.responses ?? []).filter((r) => {
    if (!accountIds.has(r.account_id)) return false;
    if (!includeDemo && demoIds.has(r.account_id)) return false;
    return true;
  });

  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const r of responses) {
    if (r.score >= 9) promoters++;
    else if (r.score >= 7) passives++;
    else detractors++;
  }
  const total = responses.length;
  const nps =
    total > 0
      ? Math.round(((promoters - detractors) / total) * 100)
      : null;

  return { responses: total, promoters, passives, detractors, nps };
}

function countChurn90d(asOf: string, accountIds: Set<string>): number {
  const churnFile = loadCustomerChurnEvents();
  if (!churnFile) return 0;
  let count = 0;
  for (const e of churnFile.events) {
    if (!accountIds.has(e.account_id)) continue;
    if (e.event !== "churned") continue;
    const days = daysBetween(e.occurred_on, asOf);
    if (days >= 0 && days <= 90) count++;
  }
  return count;
}

export function buildCustomerSuccessView(opts?: {
  horizonDays?: number;
  qbrHorizonDays?: number;
  includeDemo?: boolean;
  accountsFile?: ReturnType<typeof loadCustomerAccounts>;
  driftOnly?: boolean;
}): CustomerSuccessView {
  const includeDemo = opts?.includeDemo ?? false;
  const horizonDays = opts?.horizonDays ?? DEFAULT_RENEWAL_HORIZON_DAYS;
  const qbrHorizonDays = opts?.qbrHorizonDays ?? DEFAULT_QBR_HORIZON_DAYS;
  const file = opts?.accountsFile ?? loadCustomerAccounts();
  const company = loadCompany();
  const asOf = currentDate();
  const allAccounts = file?.accounts ?? [];
  const accounts = filterAccounts(allAccounts, includeDemo);
  const accountIds = new Set(accounts.map((a) => a.id));

  const by_health: CustomerSuccessView["by_health"] = {
    healthy: 0,
    at_risk: 0,
    critical: 0,
    churned: 0,
  };
  for (const a of accounts) {
    by_health[a.health ?? "healthy"] += 1;
  }

  const renewal_alerts: CustomerSuccessView["renewal_alerts"] = [];
  for (const a of accounts) {
    if (!a.renewal_date || a.health === "churned") continue;
    const remaining = daysBetween(asOf, a.renewal_date);
    if (remaining >= 0 && remaining <= horizonDays) {
      renewal_alerts.push({
        account_id: a.id,
        company: a.company,
        renewal_date: a.renewal_date,
        days_remaining: remaining,
        health: a.health ?? "healthy",
      });
    }
  }
  renewal_alerts.sort((a, b) => a.days_remaining - b.days_remaining);

  const rubric = loadHealthRubric();
  const signals = loadCustomerHealthSignals()?.signals ?? [];
  const npsResponses = loadCustomerNps()?.responses ?? [];
  const onboardings = loadCustomerOnboarding()?.onboardings ?? [];
  const signalByAccount = latestByAccountId(signals, "observed_on");
  const npsByAccount = latestByAccountId(npsResponses, "surveyed_on");
  const onboardingMap = onboardingByAccountId(onboardings);

  let scored: AccountHealthResult[] = accounts.map((account) =>
    computeAccountHealth(
      {
        account,
        asOf,
        latestSignal: signalByAccount.get(account.id),
        latestNps: npsByAccount.get(account.id),
        onboarding: onboardingMap.get(account.id),
      },
      rubric,
    ),
  );
  if (opts?.driftOnly) {
    scored = scored.filter((s) => s.drift);
  }
  scored.sort((a, b) => a.score - b.score);

  const drift_count = scored.filter((s) => s.drift).length;
  const onboarding_overdue = collectOnboardingOverdue(
    accounts,
    onboardings.filter((o) => accountIds.has(o.account_id)),
    asOf,
  );
  const qbr_due = collectQbrDue(accounts, asOf, qbrHorizonDays);
  const nps = summarizeNps(accountIds, includeDemo, allAccounts);
  const churn_90d = countChurn90d(asOf, accountIds);

  const notes: string[] = [];
  if (!includeDemo && allAccounts.some((a) => a.demo === true)) {
    notes.push("demo: true の顧客を集計から除外しています。");
  }
  if (drift_count > 0) {
    notes.push(
      `health 宣言と算出 recommended が ${drift_count} 件乖離しています（orgos validate で WARNING）。`,
    );
  }

  return {
    company_name: company.name,
    as_of: asOf,
    horizon_days: horizonDays,
    include_demo: includeDemo,
    total_accounts: accounts.length,
    by_health,
    renewal_alerts,
    scored,
    drift_count,
    onboarding_overdue,
    qbr_due,
    nps,
    churn_90d,
    notes,
  };
}

export function formatCustomerSuccessMarkdown(
  view: CustomerSuccessView,
  opts?: { showScores?: boolean },
): string {
  const lines = [
    `# カスタマーサクセス — ${view.company_name}`,
    "",
    `**基準日:** ${view.as_of}`,
    `**SoT Path:** \`data/customers/accounts.yaml\``,
    `**顧客数:** **${view.total_accounts}**`,
    `- healthy: ${view.by_health.healthy}`,
    `- at_risk: ${view.by_health.at_risk}`,
    `- critical: ${view.by_health.critical}`,
    `- churned: ${view.by_health.churned}`,
    `- drift: ${view.drift_count}`,
  ];
  if (view.nps.responses > 0) {
    lines.push(
      `- NPS: ${view.nps.nps ?? "—"}（${view.nps.responses} 件 · P${view.nps.promoters}/Pa${view.nps.passives}/D${view.nps.detractors}）`,
    );
  }
  if (view.churn_90d > 0) {
    lines.push(`- 90日以内解約イベント: ${view.churn_90d}`);
  }
  lines.push("", `## 更新期日（${view.horizon_days} 日以内）`);
  if (view.renewal_alerts.length === 0) {
    lines.push("該当なし。");
  } else {
    lines.push(
      "",
      "| 顧客ID | 会社 | 更新日 | 残日数 | ヘルス |",
      "|---|---|---|---:|---|",
    );
    for (const r of view.renewal_alerts) {
      lines.push(
        `| ${r.account_id} | ${r.company} | ${r.renewal_date} | ${r.days_remaining} | ${r.health} |`,
      );
    }
  }

  if (opts?.showScores && view.scored.length > 0) {
    lines.push("", "## ヘルススコア");
    lines.push(
      "",
      "| 顧客ID | 会社 | score | 宣言 | 算出 | drift |",
      "|---|---|---:|---|---|---|",
    );
    for (const s of view.scored) {
      lines.push(
        `| ${s.account_id} | ${s.company} | ${s.score} | ${s.declared} | ${s.recommended} | ${s.drift ? "yes" : ""} |`,
      );
    }
  }

  if (view.onboarding_overdue.length > 0) {
    lines.push("", "## オンボーディング遅延");
    for (const o of view.onboarding_overdue.slice(0, 10)) {
      lines.push(
        `- ${o.company} (${o.account_id}): ${o.milestone_key} · ${o.days_overdue} 日超過`,
      );
    }
  }

  if (view.qbr_due.length > 0) {
    lines.push("", "## QBR 予定");
    for (const q of view.qbr_due.slice(0, 10)) {
      lines.push(
        `- ${q.company} (${q.account_id}): ${q.next_due} · 残 ${q.days_remaining} 日`,
      );
    }
  }

  if (view.notes.length > 0) {
    lines.push("", "## 注記", ...view.notes.map((n) => `- ${n}`));
  }
  lines.push(
    "",
    "```bash",
    "npm run orgos -- sales customers --scores",
    "```",
  );
  return lines.join("\n");
}

export function formatCustomerSuccessTodayLines(view: CustomerSuccessView): string[] {
  const atRisk = view.by_health.at_risk + view.by_health.critical;
  const nearest = view.renewal_alerts[0];
  const npsLine =
    view.nps.responses > 0
      ? ` · NPS ${view.nps.nps ?? "—"}`
      : "";
  return [
    `- 顧客: ${view.total_accounts} 件（at_risk+critical ${atRisk} · drift ${view.drift_count}）${npsLine}`,
    `- ${view.horizon_days}日以内更新: ${view.renewal_alerts.length} 件` +
      (nearest
        ? `（直近 ${nearest.company} ${nearest.renewal_date}）`
        : ""),
  ];
}

export function formatCustomerSuccessCeoReply(view: CustomerSuccessView): string {
  const atRisk = view.by_health.at_risk + view.by_health.critical;
  const parts = [
    `顧客 ${view.total_accounts} 件（要警戒 ${atRisk} · drift ${view.drift_count}）`,
    `${view.horizon_days}日以内更新 ${view.renewal_alerts.length} 件`,
  ];
  if (view.nps.responses > 0 && view.nps.nps != null) {
    parts.push(`NPS ${view.nps.nps}`);
  }
  if (view.onboarding_overdue.length > 0) {
    parts.push(`オンボーディング遅延 ${view.onboarding_overdue.length} 件`);
  }
  return parts.join(" · ");
}
