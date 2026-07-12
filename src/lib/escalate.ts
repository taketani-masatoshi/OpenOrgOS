import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import type { EscalationInput, Handoff, WorkOrderPlan } from "../../schemas/routing.js";
import { handoffSchema } from "../../schemas/routing.js";
import {
  buildHandoff,
  formatHandoffMarkdown,
  loadHandoff,
  listHandoffs,
  matchRoutes,
  pickBestRoute,
  routingQueueDir,
  type MatchedRoute,
} from "./routing.js";
import {
  agentPromptPath,
  formatAgentPromptRef,
  formatSkillReference,
  isAgentInteractiveSkill,
  readAgentDefinition,
} from "./agent-portability.js";
import { loadSkillRegistry } from "./skill-registry.js";
import { getTenantId, setTenantId } from "./tenant.js";
import { currentDate, writeYamlFile } from "./utils.js";
import { appendAuditEvent } from "./audit-log.js";
import { createMissionFromWorkOrder, relayWorkOrderComplete } from "./agent-reporting.js";
import { pushQueueEvent } from "./queue-db.js";
import {
  assertActiveTenant,
  assertIntraOrgAgentTarget,
  assertIntraOrgText,
} from "./org-boundary.js";
import { scopesForAgent } from "./org/delegation-scopes.js";

const PROMPTS_SUBDIR = "prompts";

export function agentPromptRef(agent: AgentId): string {
  return `@${agentPromptPath(agent)}`;
}

export function promptsDir(): string {
  const dir = join(routingQueueDir(), PROMPTS_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function generateWorkOrderId(): string {
  return nextWorkOrderIds(1)[0]!;
}

export function nextWorkOrderIds(count: number): string[] {
  const date = currentDate().replace(/-/g, "");
  const prefix = `IMP-${date}-`;
  const dir = routingQueueDir();
  let max = 0;
  if (existsSync(dir)) {
    const existing = readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".yaml"))
      .map((f) => parseInt(f.slice(prefix.length, prefix.length + 3), 10))
      .filter((n) => !Number.isNaN(n));
    max = existing.length ? Math.max(...existing) : 0;
  }
  return Array.from(
    { length: count },
    (_, i) => `${prefix}${String(max + i + 1).padStart(3, "0")}`
  );
}

export function parseEscalationText(text: string): EscalationInput {
  const input: EscalationInput = { text };
  const lines = text.split("\n");
  for (const line of lines) {
    const subject = line.match(/^\*\*件名:\*\*\s*(.+)/);
    if (subject) input.subject = subject[1].trim();
    const background = line.match(/^\*\*背景:\*\*\s*(.+)/);
    if (background) input.background = background[1].trim();
    const requirements = line.match(/^\*\*実装要件:\*\*\s*(.+)/);
    if (requirements) input.requirements = requirements[1].trim();
    const priority = line.match(/^\*\*優先度:\*\*\s*(P[0-3])/);
    if (priority) input.priority = priority[1] as EscalationInput["priority"];
  }
  if (!input.requirements && !input.subject) {
    input.requirements = text.trim();
  }
  return input;
}

function isEligible(m: MatchedRoute): boolean {
  if (!m.access.allowed || !m.moduleEnabled || !m.boundaryOk) return false;
  try {
    assertIntraOrgAgentTarget(m.route.agent, "escalate route");
    scopesForAgent(m.route.agent);
  } catch {
    return false;
  }
  return true;
}

function uniqueAgents(matches: MatchedRoute[]): AgentId[] {
  const seen = new Set<AgentId>();
  const agents: AgentId[] = [];
  for (const m of matches) {
    if (!isEligible(m)) continue;
    if (seen.has(m.route.agent)) continue;
    seen.add(m.route.agent);
    agents.push(m.route.agent);
  }
  return agents;
}

export function planWorkOrders(
  input: EscalationInput,
  opts?: { maxAgents?: number }
): WorkOrderPlan {
  assertIntraOrgText(
    [input.subject, input.background, input.requirements, input.text].filter(Boolean).join(" "),
    "escalate plan"
  );
  if (input.tenant) assertActiveTenant(input.tenant, "escalate plan");
  const maxAgents = opts?.maxAgents ?? 3;
  const matchText = [input.subject, input.background, input.requirements, input.text]
    .filter(Boolean)
    .join(" ");
  const matches = matchRoutes({ text: matchText, path: input.path });
  const eligible = matches.filter(isEligible).slice(0, maxAgents);

  let agents = uniqueAgents(eligible);
  if (agents.length === 0) {
    const fallback = pickBestRoute({ text: matchText, path: input.path });
    if (fallback && isEligible(fallback)) {
      agents = [fallback.route.agent];
    }
  }

  return {
    input,
    matches: matches.slice(0, 10).map((m) => ({
      routeId: m.route.id,
      agent: m.route.agent,
      skill: m.route.skill,
      score: m.score,
      eligible: isEligible(m),
    })),
    agents,
    multiAgent: agents.length > 1,
  };
}

function buildImplementHandoff(
  id: string,
  options: {
    fromAgent: string;
    toAgent: AgentId;
    matched?: MatchedRoute;
    input: EscalationInput;
    parentId?: string;
    mode?: Handoff["mode"];
  }
): Handoff {
  const matched = options.matched;
  const access =
    matched?.access ??
    buildHandoff(
      { toAgent: options.toAgent, path: options.input.path, text: options.input.text },
      matched
    ).access;

  return handoffSchema.parse({
    id,
    created_at: new Date().toISOString(),
    from_agent: options.fromAgent,
    to_agent: options.toAgent,
    skill: matched?.route.skill,
    route_id: matched?.route.id,
    mode: options.mode ?? "implement",
    task_type: "implement",
    access: { allowed: access.allowed, reason: access.reason },
    context: {
      text: options.input.text ?? options.input.requirements,
      path: options.input.path,
    },
    status: access.allowed ? "pending" : "blocked",
    subject: options.input.subject,
    background: options.input.background,
    requirements: options.input.requirements,
    deliverables: options.input.deliverables ?? [],
    acceptance_criteria: options.input.acceptance_criteria ?? [],
    parent_id: options.parentId,
    agent_prompt_path: join(PROMPTS_SUBDIR, `${id}_${options.toAgent}.md`),
    priority: options.input.priority ?? "P2",
    tenant: options.input.tenant ?? getTenantId(),
  });
}

export function formatWorkOrderMarkdown(handoff: Handoff, matched?: MatchedRoute): string {
  const base = formatHandoffMarkdown(handoff, matched);
  const extra: string[] = [
    "",
    "## Work Order",
    "",
    `| 項目 | 値 |`,
    `|------|-----|`,
    `| task_type | ${handoff.task_type} |`,
    `| subject | ${handoff.subject ?? "—"} |`,
    `| priority | ${handoff.priority ?? "—"} |`,
    `| tenant | ${handoff.tenant ?? "—"} |`,
    `| parent_id | ${handoff.parent_id ?? "—"} |`,
    "",
  ];

  if (handoff.background) {
    extra.push("### 背景", "", handoff.background, "");
  }
  if (handoff.requirements) {
    extra.push("### 実装要件", "", handoff.requirements, "");
  }
  if (handoff.deliverables.length) {
    extra.push("### Deliverables", "", ...handoff.deliverables.map((d) => `- ${d}`), "");
  }
  if (handoff.acceptance_criteria.length) {
    extra.push(
      "### Acceptance Criteria",
      "",
      ...handoff.acceptance_criteria.map((c) => `- ${c}`),
      ""
    );
  }
  if (handoff.child_ids?.length) {
    extra.push("### 子 Work Orders", "", ...handoff.child_ids.map((c) => `- ${c}`), "");
  }
  if (handoff.agent_prompt_path) {
    extra.push(
      "### Agent 実装プロンプト",
      "",
      `\`docs/reports/routing-queue/${handoff.agent_prompt_path}\``,
      "",
      "Cursor: 並列チャットで `@` + 上記 MD を起動",
      ""
    );
  }

  return base + extra.join("\n");
}

export function formatAgentImplementationPrompt(handoff: Handoff): string {
  const agent = handoff.to_agent;
  const ref = formatAgentPromptRef(agent, "portable");
  const skill = handoff.skill ? loadSkillRegistry().find((s) => s.id === handoff.skill) : undefined;
  const cliHint =
    skill?.runtime === "cli" && skill.cli_command
      ? `\`npm run orgos -- skills run ${skill.cli_command}\``
      : skill && isAgentInteractiveSkill(skill)
        ? formatSkillReference(skill, "portable")
        : null;

  const lines = [
    `# Work Order Implementation · ${handoff.id} · ${agent}`,
    "",
    "## Agent 定義",
    "",
    ref,
    "",
    "### Agent 定義（本文 · ツール非依存）",
    "",
    readAgentDefinition(agent),
    "",
    "## Work Order 参照",
    "",
    `- **ID:** ${handoff.id}`,
    `- **From:** ${handoff.from_agent}`,
    `- **Route:** ${handoff.route_id ?? "—"}`,
    `- **Priority:** ${handoff.priority ?? "P2"}`,
    `- **Status:** ${handoff.status}`,
    "",
  ];

  if (handoff.parent_id) {
    lines.push(`- **Parent:** ${handoff.parent_id}`, "");
  }

  if (handoff.subject) {
    lines.push("## 件名", "", handoff.subject, "");
  }
  if (handoff.background) {
    lines.push("## 背景", "", handoff.background, "");
  }
  if (handoff.requirements) {
    lines.push("## 実装要件", "", handoff.requirements, "");
  }

  if (handoff.deliverables.length) {
    lines.push("## Deliverables", "", ...handoff.deliverables.map((d) => `- ${d}`), "");
  } else {
    lines.push("## Deliverables", "", "- （Orchestrator / CLI で指定）", "");
  }

  if (handoff.acceptance_criteria.length) {
    lines.push(
      "## Acceptance Criteria",
      "",
      ...handoff.acceptance_criteria.map((c) => `- ${c}`),
      ""
    );
  } else {
    lines.push(
      "## Acceptance Criteria",
      "",
      "- `npm run check` 通過",
      "- 担当 Primary Folders のみ編集",
      ""
    );
  }

  lines.push(
    "## 制約",
    "",
    "- [folder_access_policy.md](../../../steward/rules/folder_access_policy.md) の Primary Folders のみ編集",
    "- 正データ YAML 編集後は `npm run validate`",
    "- L2/L3 値をチャット · レポートに出力しない",
    "- Orchestrator / Executive Steward は正データを編集しない",
    ""
  );

  if (cliHint) {
    lines.push("## CLI Skill（あれば先に実行）", "", cliHint, "");
  }

  lines.push(
    "## 完了",
    "",
    "実装完了後:",
    "",
    "```bash",
    `npm run orgos -- escalate complete --id ${handoff.id} --notes "完了概要"`,
    "```",
    ""
  );

  return lines.join("\n");
}

export function writeWorkOrderFiles(
  handoff: Handoff,
  matched?: MatchedRoute
): {
  yamlPath: string;
  mdPath: string;
  promptPath?: string;
} {
  const dir = routingQueueDir();
  const yamlPath = join(dir, `${handoff.id}.yaml`);
  const mdPath = join(dir, `${handoff.id}.md`);
  writeYamlFile(yamlPath, handoff);
  writeFileSync(mdPath, formatWorkOrderMarkdown(handoff, matched), "utf-8");

  if (handoff.task_type === "implement") {
    appendAuditEvent({
      event: "escalate",
      ref: handoff.id,
      actor: handoff.from_agent,
      detail: handoff.subject ?? handoff.requirements?.slice(0, 80),
    });
    pushQueueEvent({
      type: "work_order_created",
      ref: handoff.id,
      payload: { agent: handoff.to_agent, parent_id: handoff.parent_id },
    });
    createMissionFromWorkOrder(handoff);
  }

  let promptPath: string | undefined;
  if (handoff.task_type === "implement" && handoff.agent_prompt_path) {
    promptPath = join(dir, handoff.agent_prompt_path);
    mkdirSync(join(dir, PROMPTS_SUBDIR), { recursive: true });
    writeFileSync(promptPath, formatAgentImplementationPrompt(handoff), "utf-8");
  }

  return { yamlPath, mdPath, promptPath };
}

export interface EscalateRunOptions {
  fromAgent?: string;
  input: EscalationInput;
  dryRun?: boolean;
  tenant?: string;
}

export interface EscalateRunResult {
  plan: WorkOrderPlan;
  parent?: Handoff;
  workOrders: Handoff[];
  files: Array<{ yamlPath: string; mdPath: string; promptPath?: string }>;
  summaryPath?: string;
}

function findMatchForAgent(agents: MatchedRoute[], agent: AgentId): MatchedRoute | undefined {
  return agents.find((m) => m.route.agent === agent && isEligible(m));
}

export function runEscalation(opts: EscalateRunOptions): EscalateRunResult {
  if (opts.tenant) setTenantId(opts.tenant);
  const input: EscalationInput = {
    ...opts.input,
    tenant: opts.tenant ?? opts.input.tenant ?? getTenantId(),
  };
  const plan = planWorkOrders(input);
  const fromAgent = opts.fromAgent ?? "executive_steward";

  if (opts.dryRun || plan.agents.length === 0) {
    return { plan, workOrders: [], files: [] };
  }

  const matchText = [input.subject, input.background, input.requirements, input.text]
    .filter(Boolean)
    .join(" ");
  const allMatches = matchRoutes({ text: matchText, path: input.path });

  const workOrders: Handoff[] = [];
  const files: EscalateRunResult["files"] = [];
  let parent: Handoff | undefined;

  if (plan.multiAgent) {
    const ids = nextWorkOrderIds(1 + plan.agents.length);
    const parentId = ids[0]!;
    const childIds = ids.slice(1);

    parent = handoffSchema.parse({
      id: parentId,
      created_at: new Date().toISOString(),
      from_agent: fromAgent,
      to_agent: "executive_steward",
      mode: "implement",
      task_type: "implement",
      access: { allowed: true, reason: "orchestrator parent" },
      context: { text: input.text ?? input.requirements, path: input.path },
      status: "pending",
      subject: input.subject,
      background: input.background,
      requirements: input.requirements,
      deliverables: input.deliverables ?? [],
      acceptance_criteria: input.acceptance_criteria ?? [],
      child_ids: childIds,
      priority: input.priority ?? "P2",
      tenant: input.tenant,
      notes: `Multi-agent work order · ${plan.agents.length} children`,
    });

    const parentFiles = writeWorkOrderFiles(parent);
    files.push(parentFiles);
    workOrders.push(parent);

    plan.agents.forEach((agent, idx) => {
      const childId = childIds[idx]!;
      const matched = findMatchForAgent(allMatches, agent);
      const child = buildImplementHandoff(childId, {
        fromAgent,
        toAgent: agent,
        matched,
        input,
        parentId,
      });
      workOrders.push(child);
      files.push(writeWorkOrderFiles(child, matched));
    });
  } else {
    const agent = plan.agents[0]!;
    const id = generateWorkOrderId();
    const matched = findMatchForAgent(allMatches, agent);
    const wo = buildImplementHandoff(id, {
      fromAgent,
      toAgent: agent,
      matched,
      input,
    });
    workOrders.push(wo);
    files.push(writeWorkOrderFiles(wo, matched));
  }

  const summaryPath = writeExecutiveSummary(fromAgent, input, workOrders, parent);
  return { plan, parent, workOrders, files, summaryPath };
}

function writeExecutiveSummary(
  fromAgent: string,
  input: EscalationInput,
  workOrders: Handoff[],
  parent?: Handoff
): string {
  const dir = routingQueueDir();
  const slug = (input.subject ?? "implementation")
    .slice(0, 40)
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, "-");
  const summaryPath = join(dir, `${currentDate()}-escalate-${slug}.md`);
  const children = workOrders.filter(
    (w) => w.parent_id || (!w.child_ids && w.task_type === "implement")
  );

  const lines = [
    `# Executive 統合サマリ · ${currentDate()}`,
    "",
    `**From:** ${fromAgent}`,
    `**件名:** ${input.subject ?? "—"}`,
    `**Tenant:** ${input.tenant ?? getTenantId()}`,
    "",
    "## 割当 Work Orders",
    "",
    "| ID | Agent | Status | Prompt |",
    "|----|-------|--------|--------|",
    ...children.map(
      (w) => `| ${w.id} | ${w.to_agent} | ${w.status} | ${w.agent_prompt_path ? "✓" : "—"} |`
    ),
    "",
  ];

  if (parent) {
    lines.push(`**親 Work Order:** ${parent.id}`, "");
  }

  lines.push(
    "## 起動手順（Phase 1）",
    "",
    "1. 各 Agent 用 `prompts/{id}_{agent}.md` を **並列 Cursor チャット** で `@` 起動",
    "2. CLI Skill がある場合: `npm run orgos -- route dispatch --id {id} --mode auto`",
    "3. 完了後: `npm run orgos -- escalate complete --id {id}`",
    ""
  );

  writeFileSync(summaryPath, lines.join("\n"), "utf-8");
  return summaryPath;
}

export function regenerateWorkOrderPrompts(id: string): string[] {
  const handoff = loadHandoff(id);
  const paths: string[] = [];

  if (handoff.child_ids?.length) {
    for (const childId of handoff.child_ids) {
      paths.push(...regenerateWorkOrderPrompts(childId));
    }
    return paths;
  }

  if (handoff.task_type !== "implement") {
    throw new Error(`${id} is not an implement work order (task_type=${handoff.task_type})`);
  }

  const promptPath = join(
    routingQueueDir(),
    handoff.agent_prompt_path ?? `${PROMPTS_SUBDIR}/${id}_${handoff.to_agent}.md`
  );
  mkdirSync(join(routingQueueDir(), PROMPTS_SUBDIR), { recursive: true });
  writeFileSync(promptPath, formatAgentImplementationPrompt(handoff), "utf-8");
  paths.push(promptPath);
  return paths;
}

export function listWorkOrders(filter?: "pending" | "blocked" | "all"): Handoff[] {
  const all = listHandoffs().filter((h) => h.task_type === "implement" || h.id.startsWith("IMP-"));
  if (!filter || filter === "all") return all;
  return all.filter((h) => h.status === filter);
}

export function completeWorkOrder(id: string, notes?: string): Handoff {
  const handoff = loadHandoff(id);
  const updated = handoffSchema.parse({
    ...handoff,
    status: "completed",
    completion_notes: notes,
  });
  writeWorkOrderFiles(updated);
  pushQueueEvent({
    type: "work_order_complete",
    ref: updated.id,
    payload: { agent: updated.to_agent },
  });
  relayWorkOrderComplete(updated, notes);
  return updated;
}

export function formatPlanOutput(plan: WorkOrderPlan, dryRun: boolean): string {
  const lines = [
    dryRun ? "# Escalate Plan (dry-run)" : "# Escalate Plan",
    "",
    `**Agents:** ${plan.agents.length ? plan.agents.join(", ") : "（マッチなし）"}`,
    `**Multi-agent:** ${plan.multiAgent ? "yes" : "no"}`,
    "",
    "## Route matches",
    "",
    "| route | agent | score | eligible |",
    "|-------|-------|-------|----------|",
    ...plan.matches.map(
      (m) => `| ${m.routeId} | ${m.agent} | ${m.score} | ${m.eligible ? "yes" : "no"} |`
    ),
    "",
  ];

  if (plan.agents.length === 0) {
    lines.push("⚠  eligible agent なし — `--to` で明示指定するか registry を確認", "");
  } else if (dryRun) {
    lines.push(
      "## Would create",
      "",
      plan.multiAgent
        ? `- 1 parent IMP + ${plan.agents.length} child IMPs`
        : `- 1 IMP → ${plan.agents[0]}`,
      `- prompts/*.md per agent`,
      `- executive summary MD`,
      ""
    );
  }

  return lines.join("\n");
}
