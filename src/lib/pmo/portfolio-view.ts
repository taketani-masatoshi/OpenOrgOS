import type { PmoProject, PmoRag, PmoStatus } from "../../../schemas/projects/index.js";
import { currentDate, daysBetween } from "../utils.js";
import { loadPmoPortfolio, PMO_PORTFOLIO_REL, pmoDirExists } from "./load.js";

export type PmoCoverage = "registered" | "unregistered" | "partial";

const EMPTY_STATUS: Record<PmoStatus, number> = {
  proposed: 0,
  active: 0,
  on_hold: 0,
  done: 0,
  cancelled: 0,
};

const EMPTY_RAG: Record<PmoRag, number> = {
  green: 0,
  amber: 0,
  red: 0,
};

export interface PmoPortfolioRow {
  id: string;
  title: string;
  status: PmoStatus;
  rag: PmoRag;
  owner_agent: string;
  target_date?: string;
  overdue_milestones: number;
  open_risks: number;
}

export interface PmoPortfolioView {
  as_of: string;
  source_path: string;
  coverage: PmoCoverage;
  total: number;
  by_status: Record<PmoStatus, number>;
  by_rag: Record<PmoRag, number>;
  overdue_milestones: number;
  open_risks: number;
  projects: PmoPortfolioRow[];
  notes: string[];
}

export interface PmoMilestoneRow {
  project_id: string;
  project_title: string;
  milestone_id: string;
  title: string;
  due: string;
  days: number;
}

export interface PmoMilestonesView {
  as_of: string;
  horizon_days: number;
  coverage: PmoCoverage;
  overdue: PmoMilestoneRow[];
  upcoming: PmoMilestoneRow[];
  notes: string[];
}

export interface PmoRiskRow {
  project_id: string;
  project_title: string;
  risk_id: string;
  summary: string;
  severity: string;
}

export interface PmoRisksView {
  as_of: string;
  coverage: PmoCoverage;
  open: PmoRiskRow[];
  by_severity: { high: number; medium: number; low: number };
  notes: string[];
}

export interface PmoShowView {
  as_of: string;
  coverage: PmoCoverage;
  found: boolean;
  project?: PmoProject;
  notes: string[];
}

function bump<K extends string>(map: Record<K, number>, key: K): void {
  map[key] += 1;
}

function openMilestones(project: PmoProject): PmoProject["milestones"] {
  return project.milestones.filter((m) => m.status === "open");
}

function isOverdue(due: string, asOf: string): boolean {
  return due < asOf;
}

export function buildPmoPortfolioView(opts?: { asOf?: string }): PmoPortfolioView {
  const asOf = opts?.asOf ?? currentDate();
  const notes: string[] = [];
  if (!pmoDirExists()) {
    return {
      as_of: asOf,
      source_path: PMO_PORTFOLIO_REL,
      coverage: "unregistered",
      total: 0,
      by_status: { ...EMPTY_STATUS },
      by_rag: { ...EMPTY_RAG },
      overdue_milestones: 0,
      open_risks: 0,
      projects: [],
      notes: ["未登録: data/projects/ にポートフォリオ YAML がありません。"],
    };
  }

  const loaded = loadPmoPortfolio();
  const byStatus = { ...EMPTY_STATUS };
  const byRag = { ...EMPTY_RAG };
  const rows: PmoPortfolioRow[] = [];
  let overdueMilestones = 0;
  let openRisks = 0;

  for (const project of loaded.projects) {
    bump(byStatus, project.status);
    bump(byRag, project.rag);
    const overdue = openMilestones(project).filter((m) => isOverdue(m.due, asOf)).length;
    const risks = project.risks.filter((r) => r.status === "open").length;
    overdueMilestones += overdue;
    openRisks += risks;
    rows.push({
      id: project.id,
      title: project.title,
      status: project.status,
      rag: project.rag,
      owner_agent: project.owner_agent,
      target_date: project.target_date,
      overdue_milestones: overdue,
      open_risks: risks,
    });
  }

  rows.sort((a, b) => a.id.localeCompare(b.id));
  if (loaded.projects.length === 0) {
    notes.push("索引は空です。PRJ-*.yaml を追加してください。");
  }

  return {
    as_of: asOf,
    source_path: PMO_PORTFOLIO_REL,
    coverage: "registered",
    total: loaded.projects.length,
    by_status: byStatus,
    by_rag: byRag,
    overdue_milestones: overdueMilestones,
    open_risks: openRisks,
    projects: rows,
    notes,
  };
}

export function buildPmoMilestonesView(opts?: { asOf?: string; days?: number }): PmoMilestonesView {
  const asOf = opts?.asOf ?? currentDate();
  const horizon = opts?.days ?? 14;
  if (!pmoDirExists()) {
    return {
      as_of: asOf,
      horizon_days: horizon,
      coverage: "unregistered",
      overdue: [],
      upcoming: [],
      notes: ["未登録: data/projects/ がありません。"],
    };
  }

  const loaded = loadPmoPortfolio();
  const overdue: PmoMilestoneRow[] = [];
  const upcoming: PmoMilestoneRow[] = [];

  for (const project of loaded.projects) {
    for (const ms of openMilestones(project)) {
      const days = daysBetween(asOf, ms.due);
      const row: PmoMilestoneRow = {
        project_id: project.id,
        project_title: project.title,
        milestone_id: ms.id,
        title: ms.title,
        due: ms.due,
        days,
      };
      if (isOverdue(ms.due, asOf)) overdue.push(row);
      else if (days <= horizon) upcoming.push(row);
    }
  }

  overdue.sort((a, b) => a.due.localeCompare(b.due) || a.project_id.localeCompare(b.project_id));
  upcoming.sort((a, b) => a.due.localeCompare(b.due) || a.project_id.localeCompare(b.project_id));

  return {
    as_of: asOf,
    horizon_days: horizon,
    coverage: "registered",
    overdue,
    upcoming,
    notes: [],
  };
}

export function buildPmoRisksView(opts?: { asOf?: string }): PmoRisksView {
  const asOf = opts?.asOf ?? currentDate();
  if (!pmoDirExists()) {
    return {
      as_of: asOf,
      coverage: "unregistered",
      open: [],
      by_severity: { high: 0, medium: 0, low: 0 },
      notes: ["未登録: data/projects/ がありません。"],
    };
  }

  const loaded = loadPmoPortfolio();
  const open: PmoRiskRow[] = [];
  const bySeverity = { high: 0, medium: 0, low: 0 };

  for (const project of loaded.projects) {
    for (const risk of project.risks.filter((r) => r.status === "open")) {
      open.push({
        project_id: project.id,
        project_title: project.title,
        risk_id: risk.id,
        summary: risk.summary,
        severity: risk.severity,
      });
      if (risk.severity === "high") bySeverity.high += 1;
      else if (risk.severity === "medium") bySeverity.medium += 1;
      else bySeverity.low += 1;
    }
  }

  open.sort((a, b) => a.project_id.localeCompare(b.project_id) || a.risk_id.localeCompare(b.risk_id));

  return {
    as_of: asOf,
    coverage: "registered",
    open,
    by_severity: bySeverity,
    notes: [],
  };
}

export function buildPmoShowView(id: string, opts?: { asOf?: string }): PmoShowView {
  const asOf = opts?.asOf ?? currentDate();
  if (!pmoDirExists()) {
    return {
      as_of: asOf,
      coverage: "unregistered",
      found: false,
      notes: ["未登録: data/projects/ がありません。"],
    };
  }
  const loaded = loadPmoPortfolio();
  const project = loaded.projects.find((p) => p.id === id);
  if (!project) {
    return {
      as_of: asOf,
      coverage: "registered",
      found: false,
      notes: [`${id} はポートフォリオにありません。`],
    };
  }
  return { as_of: asOf, coverage: "registered", found: true, project, notes: [] };
}

export function formatPmoPortfolioMarkdown(view: PmoPortfolioView): string {
  const lines = [
    `# PMO ポートフォリオ`,
    "",
    `**基準日:** ${view.as_of}`,
    `**ソース:** Path: \`${view.source_path}\``,
    `**被覆:** ${view.coverage}`,
    "",
    "## 集計",
    `- **案件数:** **${view.total}**`,
    `- RAG: red ${view.by_rag.red} · amber ${view.by_rag.amber} · green ${view.by_rag.green}`,
    `- status: active ${view.by_status.active} · proposed ${view.by_status.proposed} · on_hold ${view.by_status.on_hold} · done ${view.by_status.done} · cancelled ${view.by_status.cancelled}`,
    `- 期限超過マイルストーン: ${view.overdue_milestones}`,
    `- open リスク: ${view.open_risks}`,
  ];
  if (view.projects.length > 0) {
    lines.push("", "## 案件");
    for (const row of view.projects) {
      lines.push(
        `- \`${row.id}\` ${row.title} · ${row.status} · ${row.rag} · ${row.owner_agent}` +
          (row.overdue_milestones ? ` · 期限超過 ${row.overdue_milestones}` : "")
      );
    }
  }
  if (view.notes.length > 0) {
    lines.push("", "## 注記", ...view.notes.map((n) => `- ${n}`));
  }
  lines.push("", "金額・個人名は出力しません。リンク先の中身は各正本を見てください。");
  return lines.join("\n");
}

export function formatPmoMilestonesMarkdown(view: PmoMilestonesView): string {
  const lines = [
    `# PMO マイルストーン`,
    "",
    `**基準日:** ${view.as_of} · 間近 ${view.horizon_days} 日`,
    `**被覆:** ${view.coverage}`,
    "",
    `## 期限超過（${view.overdue.length}）`,
  ];
  if (view.overdue.length === 0) lines.push("- （なし）");
  for (const row of view.overdue) {
    lines.push(`- \`${row.project_id}\` ${row.title} · due ${row.due} · ${Math.abs(row.days)} 日超過`);
  }
  lines.push("", `## 間近（${view.upcoming.length}）`);
  if (view.upcoming.length === 0) lines.push("- （なし）");
  for (const row of view.upcoming) {
    lines.push(`- \`${row.project_id}\` ${row.title} · due ${row.due} · 残り ${row.days} 日`);
  }
  if (view.notes.length > 0) {
    lines.push("", "## 注記", ...view.notes.map((n) => `- ${n}`));
  }
  return lines.join("\n");
}

export function formatPmoRisksMarkdown(view: PmoRisksView): string {
  const lines = [
    `# PMO リスク（open）`,
    "",
    `**基準日:** ${view.as_of}`,
    `**被覆:** ${view.coverage}`,
    `- high ${view.by_severity.high} · medium ${view.by_severity.medium} · low ${view.by_severity.low}`,
    "",
    "## 一覧",
  ];
  if (view.open.length === 0) lines.push("- （なし）");
  for (const row of view.open) {
    lines.push(`- \`${row.project_id}\` [${row.severity}] ${row.summary}`);
  }
  if (view.notes.length > 0) {
    lines.push("", "## 注記", ...view.notes.map((n) => `- ${n}`));
  }
  return lines.join("\n");
}

export function formatPmoShowMarkdown(view: PmoShowView): string {
  if (!view.found || !view.project) {
    return [`# PMO 案件`, "", view.notes[0] ?? "見つかりません。"].join("\n");
  }
  const p = view.project;
  const links = p.links;
  const lines = [
    `# ${p.id} — ${p.title}`,
    "",
    `**status:** ${p.status} · **RAG:** ${p.rag} · **owner:** ${p.owner_agent} · **sponsor:** ${p.sponsor}`,
    p.target_date ? `**target:** ${p.target_date}` : undefined,
    "",
    "## マイルストーン",
    ...(p.milestones.length
      ? p.milestones.map((m) => `- ${m.id} ${m.title} · ${m.due} · ${m.status}`)
      : ["- （なし）"]),
    "",
    "## リスク",
    ...(p.risks.length
      ? p.risks.map((r) => `- ${r.id} [${r.severity}/${r.status}] ${r.summary}`)
      : ["- （なし）"]),
    "",
    "## リンク（id のみ）",
    `- CTR: ${links.contract_ids.join(", ") || "—"}`,
    `- WO: ${links.work_order_ids.join(", ") || "—"}`,
    `- PROP: ${links.property_ids.join(", ") || "—"}`,
    `- modules: ${
      links.module_refs.map((m) => (m.ref ? `${m.module}:${m.ref}` : m.module)).join(", ") || "—"
    }`,
  ].filter((line): line is string => line !== undefined);
  return lines.join("\n");
}

/** Short CEO-facing reply for Steward Chat. Detail stays on `orgos pmo portfolio`. */
export function formatPmoCeoReply(view: PmoPortfolioView): string {
  if (view.coverage === "unregistered") return "未登録";
  return `${view.total}件 · red ${view.by_rag.red} · amber ${view.by_rag.amber} · green ${view.by_rag.green} · 期限超過 ${view.overdue_milestones}`;
}
