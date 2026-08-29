import type { AgentId } from "../../../schemas/classification.js";
import { hydrateAiaQueueState } from "../aia/queue-store.js";
import { getCatalogAgent } from "../agent-catalog.js";
import { isAgentActive } from "../agent-activation.js";
import { loadTenantAgentRoster } from "../agent-roster.js";
import { loadEmployees } from "../data.js";
import { loadOrgChart } from "../org/org-chart.js";
import { listActiveOperators } from "../org/operators.js";
import { listHandoffs } from "../routing.js";
import { loadHumanCapacity } from "./human-capacity.js";

export interface TowerAiaTypeRow {
  agent_id: AgentId;
  name_ja: string;
  binds_modules: string[];
  dispatchable: boolean;
  queued: number;
  running: number;
}

export interface TowerAiaRuntimeRow {
  agent_id: AgentId;
  module_id?: string;
  queued: number;
  running: number;
}

export interface TowerHumanRow {
  employee_id: string;
  display_name: string;
  title?: string;
  operator_id?: string;
  tags: string[];
  open_cards: number;
  weekly_hours_capacity?: number;
}

export interface TowerInventory {
  aia_types: TowerAiaTypeRow[];
  aia_runtime: TowerAiaRuntimeRow[];
  humans: TowerHumanRow[];
  open_human_cards: number;
  open_aia_cards: number;
}

function openCardCountByEmployee(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const h of listHandoffs()) {
    if (h.task_type !== "implement" || h.status === "completed") continue;
    if (!h.assignee_employee_id) continue;
    counts.set(
      h.assignee_employee_id,
      (counts.get(h.assignee_employee_id) ?? 0) + 1
    );
  }
  return counts;
}

function countOpenHumanCards(): number {
  return listHandoffs().filter(
    (h) =>
      h.task_type === "implement" &&
      h.status !== "completed" &&
      h.assignee_employee_id &&
      h.work_kind &&
      h.work_kind !== "fact_live" &&
      h.work_kind !== "aia_draft"
  ).length;
}

function countOpenAiaCards(): number {
  return listHandoffs().filter(
    (h) =>
      h.task_type === "implement" &&
      h.status !== "completed" &&
      (h.work_kind === "aia_draft" || (!h.assignee_employee_id && h.to_agent))
  ).length;
}

export function buildTowerInventory(): TowerInventory {
  const roster = loadTenantAgentRoster();
  const operational = roster.roster.profiles.operational ?? [];
  const disabled = new Set(roster.roster.disabled ?? []);
  const { runs, queueOrder } = hydrateAiaQueueState();

  const runtimeByAgent = new Map<AgentId, { queued: number; running: number }>();
  for (const run of runs.values()) {
    const agent = run.agent_id as AgentId;
    const bucket = runtimeByAgent.get(agent) ?? { queued: 0, running: 0 };
    if (run.state === "queued") bucket.queued += 1;
    if (run.state === "running") bucket.running += 1;
    runtimeByAgent.set(agent, bucket);
  }

  const aia_types: TowerAiaTypeRow[] = [];
  for (const agentId of operational) {
    if (disabled.has(agentId)) continue;
    const entry = getCatalogAgent(agentId);
    if (!entry) continue;
    const dispatchable = isAgentActive(agentId, { profile: "operational", mode: "implement" });
    const runtime = runtimeByAgent.get(agentId) ?? { queued: 0, running: 0 };
    aia_types.push({
      agent_id: agentId,
      name_ja: entry.name_ja ?? entry.name,
      binds_modules: entry.binds_modules ?? [],
      dispatchable,
      queued: runtime.queued,
      running: runtime.running,
    });
  }

  const aia_runtime: TowerAiaRuntimeRow[] = [...runtimeByAgent.entries()].map(
    ([agent_id, counts]) => ({
      agent_id,
      queued: counts.queued,
      running: counts.running,
    })
  );

  const employees = loadEmployees().employees.filter((e) => e.status === "active");
  const chart = loadOrgChart();
  const chartByEmployee = new Map<string, { title?: string }>();
  if (chart) {
    for (const node of chart.nodes) {
      if (node.employee_id) {
        chartByEmployee.set(node.employee_id, { title: node.title });
      }
    }
  }
  const capacity = loadHumanCapacity();
  const capacityByEmployee = new Map(
    capacity.members.map((m) => [m.employee_id, m])
  );
  const operatorById = new Map(
    listActiveOperators().map((o) => [o.operator_id, o])
  );
  const openCounts = openCardCountByEmployee();

  const humans: TowerHumanRow[] = employees.map((emp) => {
    const cap = capacityByEmployee.get(emp.id);
    const chartRow = chartByEmployee.get(emp.id);
    return {
      employee_id: emp.id,
      display_name: emp.name,
      title: chartRow?.title ?? emp.job_type ?? undefined,
      operator_id: cap?.operator_id,
      tags: cap?.tags ?? [],
      open_cards: openCounts.get(emp.id) ?? 0,
      weekly_hours_capacity: cap?.weekly_hours_capacity,
    };
  });

  return {
    aia_types,
    aia_runtime,
    humans,
    open_human_cards: countOpenHumanCards(),
    open_aia_cards: countOpenAiaCards(),
  };
}

export function formatTowerInventoryMarkdown(inventory: TowerInventory): string {
  const lines = [
    "# 司令塔在庫",
    "",
    `未完了（人）: ${inventory.open_human_cards} · AIA: ${inventory.open_aia_cards}`,
    "",
    "## AIA 種類",
    "",
    "| agent | 稼働 | 待ち | dispatchable |",
    "|-------|------|------|--------------|",
    ...inventory.aia_types.map(
      (row) =>
        `| ${row.name_ja} (${row.agent_id}) | ${row.running} | ${row.queued} | ${row.dispatchable ? "yes" : "no"} |`
    ),
    "",
    "## 人間負荷",
    "",
    "| 氏名 | 役職 | 未完了 | tags |",
    "|------|------|--------|------|",
    ...inventory.humans.map(
      (row) =>
        `| ${row.display_name} | ${row.title ?? "—"} | ${row.open_cards} | ${row.tags.join(", ") || "—"} |`
    ),
  ];
  return lines.join("\n");
}

export function buildIntegrationTowerBriefLines(): string[] {
  const inventory = buildTowerInventory();
  const lines = [
    `Tower · human open: ${inventory.open_human_cards} · AIA open: ${inventory.open_aia_cards}`,
  ];
  const busyHumans = inventory.humans
    .filter((h) => h.open_cards > 0)
    .sort((a, b) => b.open_cards - a.open_cards)
    .slice(0, 5);
  for (const h of busyHumans) {
    lines.push(`- ${h.display_name}: ${h.open_cards} card(s)`);
  }
  const runningAia = inventory.aia_types
    .filter((a) => a.running > 0 || a.queued > 0)
    .slice(0, 5);
  for (const a of runningAia) {
    lines.push(`- AIA ${a.agent_id}: run ${a.running} · queue ${a.queued}`);
  }
  return lines;
}
