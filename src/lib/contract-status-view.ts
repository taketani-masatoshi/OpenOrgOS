/**
 * Executive L1 contract portfolio view (counts, expiry, exit/termination windows).
 * Reuses scanContractAlerts + loadContracts — no contract body / L2.
 */
import type { Contract } from "../../schemas/index.js";
import { loadCompany, loadContracts } from "./data.js";
import { scanContractAlerts, type ContractAlert } from "./alerts.js";
import { currentDate, daysBetween } from "./utils.js";

const DEFAULT_HORIZON_DAYS = 90;

export type ExitWindowKind =
  | "renewal_notice"
  | "mid_term_termination"
  | "non_renewal"
  | "end_of_term"
  | "termination_deadline";

export interface ContractExitOpportunity {
  contract_id: string;
  contract_name: string;
  counterparty: string;
  kind: ExitWindowKind;
  deadline: string;
  days_remaining: number;
  summary: string;
  status: string;
}

export interface ContractStatusView {
  company_name: string;
  as_of: string;
  horizon_days: number;
  total: number;
  by_status: {
    draft: number;
    pending_signature: number;
    executed: number;
    terminated: number;
  };
  alerts: ContractAlert[];
  /** Termination / non-renewal / mid-term windows within horizon (L1). */
  exit_opportunities: ContractExitOpportunity[];
  notes: string[];
}

function countByStatus(contracts: Contract[]): ContractStatusView["by_status"] {
  const by = {
    draft: 0,
    pending_signature: 0,
    executed: 0,
    terminated: 0,
  };
  for (const c of contracts) {
    const s = c.status ?? "draft";
    if (s in by) by[s as keyof typeof by] += 1;
  }
  return by;
}

function exitKindLabel(kind: ExitWindowKind): string {
  switch (kind) {
    case "renewal_notice":
      return "更新通知期限";
    case "mid_term_termination":
      return "中途解約窓";
    case "non_renewal":
      return "非更新期限";
    case "end_of_term":
      return "満了対応";
    case "termination_deadline":
      return "解約期限";
  }
}

/**
 * Collect CEO exit_windows + risk.termination_deadline within horizon.
 */
export function collectExitOpportunities(
  contracts: Contract[],
  horizonDays = DEFAULT_HORIZON_DAYS,
  asOf = currentDate()
): ContractExitOpportunity[] {
  const out: ContractExitOpportunity[] = [];

  for (const c of contracts) {
    if (c.status === "terminated") continue;
    if (c.ceo?.demo === true) continue;

    if (c.risk?.termination_deadline) {
      const remaining = daysBetween(asOf, c.risk.termination_deadline);
      if (remaining >= 0 && remaining <= horizonDays) {
        out.push({
          contract_id: c.id,
          contract_name: c.name,
          counterparty: c.counterparty,
          kind: "termination_deadline",
          deadline: c.risk.termination_deadline,
          days_remaining: remaining,
          summary: c.risk.notes ?? "risk.termination_deadline",
          status: c.status ?? "draft",
        });
      }
    }

    for (const w of c.ceo?.exit_windows ?? []) {
      if (!w.deadline) continue;
      const remaining = daysBetween(asOf, w.deadline);
      if (remaining < 0 || remaining > horizonDays) continue;
      out.push({
        contract_id: c.id,
        contract_name: c.name,
        counterparty: c.counterparty,
        kind: w.kind,
        deadline: w.deadline,
        days_remaining: remaining,
        summary: w.summary,
        status: c.status ?? "draft",
      });
    }
  }

  out.sort((a, b) => a.days_remaining - b.days_remaining);
  return out;
}

export function buildContractStatusView(opts?: {
  horizonDays?: number;
  contracts?: Contract[];
}): ContractStatusView {
  const horizonDays = opts?.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const contracts = opts?.contracts ?? loadContracts();
  const company = loadCompany();
  const asOf = currentDate();
  const alerts = scanContractAlerts(contracts, horizonDays);
  const exit_opportunities = collectExitOpportunities(contracts, horizonDays, asOf);
  const notes: string[] = [];
  if (contracts.some((c) => c.id === "CTR-099")) {
    notes.push("CTR-099（Test）を含む台帳です。経営判断では除外を検討してください。");
  }
  const missingExit = contracts.filter(
    (c) =>
      (c.status === "executed" || c.status === "pending_signature") &&
      !c.risk?.termination_deadline &&
      !(c.ceo?.exit_windows?.length)
  );
  if (missingExit.length > 0) {
    notes.push(
      `解約・退出窓未設定: ${missingExit.length} 件（risk.termination_deadline / ceo.exit_windows）`
    );
  }

  return {
    company_name: company.name,
    as_of: asOf,
    horizon_days: horizonDays,
    total: contracts.length,
    by_status: countByStatus(contracts),
    alerts,
    exit_opportunities,
    notes,
  };
}

function alertTypeJa(type: ContractAlert["alertType"]): string {
  if (type === "end_date") return "契約終了";
  if (type === "renewal_deadline") return "更新期限";
  return "解約期限";
}

export function formatContractStatusMarkdown(view: ContractStatusView): string {
  const lines = [
    `# 契約ポートフォリオ — ${view.company_name}`,
    "",
    `**基準日:** ${view.as_of}`,
    `**台帳 Path:** \`data/contracts/\``,
    `**契約本数:** **${view.total}**`,
    `- executed: ${view.by_status.executed}`,
    `- draft: ${view.by_status.draft}`,
    `- pending_signature: ${view.by_status.pending_signature}`,
    `- terminated: ${view.by_status.terminated}`,
    "",
    `## 直近の期限（${view.horizon_days}日以内）`,
  ];

  if (view.alerts.length === 0) {
    lines.push("該当なし。");
  } else {
    lines.push("", "| 契約ID | 名称 | 種別 | 期限 | 残日数 | リスク |", "|---|---|---|---|---:|---|");
    for (const a of view.alerts) {
      lines.push(
        `| ${a.contractId} | ${a.contractName} | ${alertTypeJa(a.alertType)} | ${a.deadline} | ${a.daysRemaining} | ${a.riskLevel} |`
      );
    }
  }

  lines.push("", `## 解除・退出の判断窓（${view.horizon_days}日以内）`);
  const exits = view.exit_opportunities.filter(
    (e) =>
      e.kind === "termination_deadline" ||
      e.kind === "mid_term_termination" ||
      e.kind === "non_renewal"
  );
  if (exits.length === 0) {
    lines.push("該当なし（termination_deadline / mid_term_termination / non_renewal）。");
  } else {
    lines.push("", "| 契約ID | 種別 | 期限 | 残日数 | 摘要 |", "|---|---|---|---:|---|");
    for (const e of exits) {
      lines.push(
        `| ${e.contract_id} | ${exitKindLabel(e.kind)} | ${e.deadline} | ${e.days_remaining} | ${e.summary} |`
      );
    }
  }

  const renewalWindows = view.exit_opportunities.filter(
    (e) => e.kind === "renewal_notice" || e.kind === "end_of_term"
  );
  if (renewalWindows.length > 0) {
    lines.push("", "## 更新・満了の判断窓", "");
    for (const e of renewalWindows) {
      lines.push(
        `- **${e.contract_id}** ${exitKindLabel(e.kind)} ${e.deadline}（残 ${e.days_remaining} 日）— ${e.summary}`
      );
    }
  }

  if (view.notes.length > 0) {
    lines.push("", "## 注記", ...view.notes.map((n) => `- ${n}`));
  }

  lines.push(
    "",
    "契約本文・個情は出しません（L1 台帳のみ）。詳細は Contract Agent へ委譲してください。",
    "",
    "```bash",
    "npm run orgos -- contracts summary",
    "npm run orgos -- alerts",
    "```"
  );
  return lines.join("\n");
}

/** Short CEO-facing reply for Steward Chat. */
export function formatContractStatusCeoReply(view: ContractStatusView): string {
  const lines = [
    `契約 **${view.total}** 件（executed ${view.by_status.executed} · draft ${view.by_status.draft}）。`,
  ];
  const nearest = view.alerts[0];
  if (nearest) {
    lines.push(
      `直近期限: ${nearest.contractName}（${nearest.deadline} · 残 ${nearest.daysRemaining} 日 · ${nearest.riskLevel}）。`
    );
  } else {
    lines.push(`直近 ${view.horizon_days} 日以内の期限アラートなし。`);
  }
  return lines.join("\n");
}

/** Compact one-liner for Today context. */
export function formatContractStatusTodayLines(view: ContractStatusView): string[] {
  const nearest = view.alerts[0];
  const nearestExit = view.exit_opportunities.find(
    (e) =>
      e.kind === "termination_deadline" ||
      e.kind === "mid_term_termination" ||
      e.kind === "non_renewal"
  );
  return [
    `- 契約本数: ${view.total}（executed ${view.by_status.executed} · draft ${view.by_status.draft}）`,
    `- ${view.horizon_days}日以内期限アラート: ${view.alerts.length} 件` +
      (nearest
        ? `（直近 ${nearest.contractId} ${alertTypeJa(nearest.alertType)} ${nearest.deadline}）`
        : ""),
    `- 解除・退出判断窓: ${
      view.exit_opportunities.filter((e) =>
        ["termination_deadline", "mid_term_termination", "non_renewal"].includes(e.kind)
      ).length
    } 件` +
      (nearestExit
        ? `（直近 ${nearestExit.contract_id} ${exitKindLabel(nearestExit.kind)} ${nearestExit.deadline}）`
        : ""),
  ];
}
