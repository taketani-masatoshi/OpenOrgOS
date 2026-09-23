import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listCatalogAgents } from "../../agent-catalog.js";
import { loadRoutingRegistry } from "../../routing.js";
import {
  EXECUTING_AGENT_OVERRIDES,
  STEWARD_SELF_EXECUTE_SKILLS,
} from "../../skill-execution-mode.js";
import { loadSkillRegistry } from "../../skill-registry.js";
import { ROOT_DIR } from "../../tenant.js";
import { generatedMarker } from "./generated-section.js";

export const SKILL_DELEGATION_MAP_PATH = join(
  ROOT_DIR,
  "steward/core/orchestrators/skill_delegation_map.md"
);

export function buildSkillRegistryIndex(): string {
  const skills = [...loadSkillRegistry()].sort((a, b) => a.id.localeCompare(b.id));
  const lines = [
    "| Skill id | runtime | agent_id | CLI | module |",
    "|----------|---------|----------|-----|--------|",
  ];
  for (const skill of skills) {
    const runtime = skill.runtime === "agent" ? "agent" : skill.runtime;
    lines.push(
      `| \`${skill.id}\` | ${runtime} | \`${skill.agent_id}\` | ${skill.cli_command ? `\`${skill.cli_command}\`` : "—"} | ${skill.moduleId ?? "core"} |`
    );
  }
  return lines.join("\n");
}

export function buildSkillDelegationRuntimeNote(): string {
  return [
    "- `runtime: agent` — LLM + Skill 定義添付（旧 `cursor-only` と同義）",
    "- `runtime: cli` — `orgos skills run` で決定論実行",
    "- 実行 Agent の override は `src/lib/skill-execution-mode.ts` が正本",
    "- 標準経路: `resolveSkillExecutionMode` → `orgos route dispatch --mode auto`（authority 一致時のみ direct）",
  ].join("\n");
}

export function buildAgentLabelIndex(): string {
  const lines = ["| 表示名 | Agent id |", "|--------|----------|"];
  for (const agent of [...listCatalogAgents()].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`| ${agent.name_ja ?? agent.name} | \`${agent.id}\` |`);
  }
  return lines.join("\n");
}

export function buildExecutingAgentOverrideTable(): string {
  const skills = loadSkillRegistry();
  const lines = [
    "| Skill id | registry agent_id | executing agent_id |",
    "|----------|-------------------|-------------------|",
  ];
  for (const [skillId, agentId] of Object.entries(EXECUTING_AGENT_OVERRIDES).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const skill = skills.find((entry) => entry.id === skillId);
    lines.push(`| \`${skillId}\` | \`${skill?.agent_id ?? "—"}\` | \`${agentId}\` |`);
  }
  return lines.join("\n");
}

export function buildStewardSelfExecuteTable(): string {
  const lines = [
    "| Skill id | executing agent | Steward の動き |",
    "|----------|-----------------|--------------|",
  ];
  for (const skillId of [...STEWARD_SELF_EXECUTE_SKILLS].sort()) {
    lines.push(`| \`${skillId}\` | \`executive_steward\` | Steward **自実行**（CLI）→ 要約読取 |`);
  }
  return lines.join("\n");
}

export function buildRoutingSkillIndex(): string {
  const routes = loadRoutingRegistry()
    .routes.filter((route) => route.skill)
    .sort((a, b) => a.id.localeCompare(b.id));
  const lines = ["| route id | agent id | skill id |", "|----------|----------|----------|"];
  for (const route of routes) {
    lines.push(`| ${route.id} | \`${route.agent}\` | \`${route.skill}\` |`);
  }
  return lines.join("\n");
}

export function buildExecutionDecisionTree(): string {
  return [
    "```",
    "Skill id / CLI が指定された",
    "│",
    "├─ resolveSkillExecutionMode()  （src/lib/skill-execution-mode.ts）",
    "│",
    "├─ direct_auto + resolution ready",
    "│     → orgos route dispatch --mode auto（authority 一致 · CLI 直実行）",
    "│",
    "├─ delegate_work_order / agent_interactive / escalate",
    "│     → Work Order（executing agent id へ IMP）",
    "│",
    "├─ deferred",
    "│     → 必須 argv / parent command 不足 — 手動 dispatch",
    "│",
    "├─ human_approval",
    "│     → wire · approval · broker — CEO ゲート",
    "│",
    "└─ skill 不明",
    "      → orgos route match --text · orgos escalate plan",
    "```",
  ].join("\n");
}

export function validateSkillDelegationNarrativeDrift(): string[] {
  const issues: string[] = [];
  const text = readFileSync(SKILL_DELEGATION_MAP_PATH, "utf-8");
  const narrative = text.replace(
    /<!-- orgos:generated:[^>]+ -->[\s\S]*?<!-- orgos:generated:[^>]+ -->/g,
    ""
  );
  if (/cursor-only/i.test(narrative)) {
    issues.push(
      "skill_delegation_map.md: remove cursor-only from narrative; use generated runtime note"
    );
  }
  if (!text.includes("skill-execution-mode.ts")) {
    issues.push(
      "skill_delegation_map.md must reference src/lib/skill-execution-mode.ts as execution SoT"
    );
  }
  const requiredSections = [
    "agent-label-index",
    "executing-agent-overrides",
    "steward-self-execute",
    "routing-skill-index",
    "execution-decision-tree",
    "skill-registry-index",
    "skill-runtime-note",
  ];
  for (const name of requiredSections) {
    if (!text.includes(generatedMarker(name, false))) {
      issues.push(`skill_delegation_map.md: missing generated section ${name}`);
    }
  }
  return issues;
}
