import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import {
  handoffSchema,
  routingRegistrySchema,
  type Handoff,
  type RouteDefinition,
  type RoutingRegistry,
} from "../../schemas/routing.js";
import {
  checkAgentAccess,
  loadClassificationRegistry,
  type AccessCheckResult,
} from "./classification.js";
import { ROUTING_REGISTRY_PATH } from "./steward-paths.js";
import { MODULE_TO_CLASSIFICATION_AGENT, loadEnabledModules } from "./modules.js";
import { loadSkillRegistry, resolveSkillFilePath } from "./skill-registry.js";
import { formatSkillReference, isAgentInteractiveSkill } from "./agent-portability.js";
import { appendAuditEvent } from "./audit-log.js";
import { currentDate, ensureDocsReportsDir, readYamlFile, writeYamlFile } from "./utils.js";

export { ROUTING_REGISTRY_PATH };
export const ROUTING_QUEUE_SUBDIR = "routing-queue";

const CORE_AGENTS = new Set<AgentId>([
  "executive_steward",
  "secretary",
  "finance",
  "contract",
  "compliance",
  "operations",
]);

/** AI カンパニー拡張 — 常時ルーティング可（modules.yaml 不要） */
const EXTENSION_AGENTS = new Set<AgentId>([
  "coo",
  "cto",
  "engineering",
  "design_lead",
  "design",
  "sales_lead",
  "sales_outbound",
  "sales_inbound",
  "customer_success",
  "marketing_lead",
  "social_media",
  "personal_finance",
  "legal",
  "security",
  "human_resources",
  "corporate_governance",
  "accounting",
  "tax",
  "procurement",
  "government_affairs",
  "intellectual_property",
  "general_affairs",
  "project_management",
  "product_management",
  "recruiting",
  "risk_insurance",
  "data_analytics",
  "devops",
  "investor_relations",
  "esg_sustainability",
  "internal_audit",
  "privacy_officer",
  "treasury",
  "customer_support",
  "pr_communications",
  "learning_development",
  "corporate_development",
  "quality_assurance",
  "medical_device_regulatory",
  "mail_intake",
  "mail_outbound",
]);

const EXECUTIVE_DATA_PREFIXES = ["data/executive/", "docs/executive/"];

export interface RouteMatchInput {
  text?: string;
  path?: string;
}

export interface MatchedRoute {
  route: RouteDefinition;
  score: number;
  matchedBy: string[];
  access: AccessCheckResult;
  moduleEnabled: boolean;
  boundaryOk: boolean;
  skillAvailable: boolean;
}

export function loadRoutingRegistry(): RoutingRegistry {
  return readYamlFile(ROUTING_REGISTRY_PATH, routingRegistrySchema);
}

export function normalizeResourcePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isExecutiveDataPath(path: string): boolean {
  const normalized = normalizeResourcePath(path);
  return EXECUTIVE_DATA_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function pathMatchesPattern(path: string, pattern: string): boolean {
  const normalized = normalizeResourcePath(path);
  const pat = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  if (pat.endsWith("/**")) {
    return normalized.startsWith(pat.slice(0, -3));
  }
  if (pat.endsWith("/*")) {
    const base = pat.slice(0, -2);
    return normalized.startsWith(base) && !normalized.slice(base.length).includes("/");
  }
  if (pat.endsWith("/")) {
    return normalized.startsWith(pat);
  }
  return normalized === pat || normalized.endsWith("/" + pat);
}

function textMatchesKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function isModuleAgentEnabled(agent: AgentId): boolean {
  if (CORE_AGENTS.has(agent) || EXTENSION_AGENTS.has(agent)) return true;
  const enabled = loadEnabledModules();
  return enabled.some((mod) => MODULE_TO_CLASSIFICATION_AGENT[mod.agent] === agent);
}

export function checkRouteAccess(agent: AgentId, resourcePaths: string[]): AccessCheckResult {
  const registry = loadClassificationRegistry();
  if (resourcePaths.length === 0) {
    return { allowed: false, reason: "resource_paths 未設定 — アクセス検証不可" };
  }
  for (const resourcePath of resourcePaths) {
    const result = checkAgentAccess(registry, agent, resourcePath, "read");
    if (!result.allowed) return result;
  }
  return { allowed: true, reason: "ok" };
}

export function checkExecutiveBoundary(route: RouteDefinition, inputPath?: string): boolean {
  const path = inputPath ? normalizeResourcePath(inputPath) : undefined;
  const executiveData = path ? isExecutiveDataPath(path) : false;

  if (executiveData) {
    return route.agent === "secretary";
  }

  if (route.boundary === "executive_data" && route.agent !== "secretary") {
    return false;
  }

  return true;
}

function isSkillAvailable(skillId?: string): boolean {
  if (!skillId) return true;
  return loadSkillRegistry().some((s) => s.id === skillId);
}

function scoreRoute(route: RouteDefinition, input: RouteMatchInput): { score: number; matchedBy: string[] } {
  let score = route.priority;
  const matchedBy: string[] = [];
  const text = input.text?.trim() ?? "";
  const path = input.path ? normalizeResourcePath(input.path) : undefined;

  for (const keyword of route.match.keywords) {
    if (text && textMatchesKeyword(text, keyword)) {
      score += 20;
      matchedBy.push(`keyword:${keyword}`);
    }
  }

  for (const intent of route.match.intents) {
    if (text && textMatchesKeyword(text, intent)) {
      score += 25;
      matchedBy.push(`intent:${intent}`);
    }
  }

  for (const pattern of route.match.paths) {
    if (path && pathMatchesPattern(path, pattern)) {
      score += 30;
      matchedBy.push(`path:${pattern}`);
    }
  }

  return { score, matchedBy };
}

export function matchRoutes(input: RouteMatchInput, registry = loadRoutingRegistry()): MatchedRoute[] {
  const results: MatchedRoute[] = [];

  for (const route of registry.routes) {
    const { score, matchedBy } = scoreRoute(route, input);
    if (matchedBy.length === 0) continue;

    const access = checkRouteAccess(route.agent, route.resource_paths);
    const moduleEnabled = route.module_agent ? isModuleAgentEnabled(route.agent) : true;
    const boundaryOk = checkExecutiveBoundary(route, input.path);
    const skillAvailable = isSkillAvailable(route.skill);

    results.push({
      route,
      score,
      matchedBy,
      access,
      moduleEnabled,
      boundaryOk,
      skillAvailable,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

export function pickBestRoute(input: RouteMatchInput, registry = loadRoutingRegistry()): MatchedRoute | undefined {
  const eligible = matchRoutes(input, registry).filter(
    (m) => m.access.allowed && m.moduleEnabled && m.boundaryOk
  );
  return eligible[0];
}

export function generateHandoffId(): string {
  const stamp = currentDate().replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `HO-${stamp}-${suffix}`;
}

export interface HandoffOptions {
  fromAgent?: string;
  toAgent?: AgentId;
  skill?: string;
  routeId?: string;
  mode?: "suggest" | "auto" | "implement";
  text?: string;
  path?: string;
  notes?: string;
}

export function buildHandoff(options: HandoffOptions, matched?: MatchedRoute): Handoff {
  const route = matched?.route;
  const toAgent = options.toAgent ?? route?.agent;
  if (!toAgent) {
    throw new Error("to_agent が未指定 — --to または match 結果が必要");
  }

  const access =
    matched?.access ??
    checkRouteAccess(toAgent, route?.resource_paths ?? (options.path ? [options.path] : []));

  return handoffSchema.parse({
    id: generateHandoffId(),
    created_at: new Date().toISOString(),
    from_agent: options.fromAgent ?? "steward",
    to_agent: toAgent,
    skill: options.skill ?? route?.skill,
    route_id: options.routeId ?? route?.id,
    mode: options.mode ?? "suggest",
    access: { allowed: access.allowed, reason: access.reason },
    context: {
      text: options.text,
      path: options.path,
    },
    status: access.allowed ? "pending" : "blocked",
    notes: options.notes,
  });
}

export function formatHandoffMarkdown(handoff: Handoff, matched?: MatchedRoute): string {
  const lines = [
    `# Agent Handoff · ${handoff.id}`,
    "",
    `| 項目 | 値 |`,
    `|------|-----|`,
    `| From | ${handoff.from_agent} |`,
    `| To | ${handoff.to_agent} |`,
    `| Skill | ${handoff.skill ?? "—"} |`,
    `| Route | ${handoff.route_id ?? "—"} |`,
    `| Mode | ${handoff.mode} |`,
    `| Access | ${handoff.access.allowed ? "✓" : "✗"} ${handoff.access.reason} |`,
    `| Status | ${handoff.status} |`,
    "",
  ];

  if (handoff.context.text || handoff.context.path) {
    lines.push("## Context", "");
    if (handoff.context.text) lines.push(`- text: ${handoff.context.text}`);
    if (handoff.context.path) lines.push(`- path: ${handoff.context.path}`);
    lines.push("");
  }

  if (matched) {
    lines.push("## Match", "", `- score: ${matched.score}`, `- matched: ${matched.matchedBy.join(", ")}`, "");
  }

  if (handoff.skill) {
    const skill = loadSkillRegistry().find((s) => s.id === handoff.skill);
    if (skill?.runtime === "cli" && skill.cli_command) {
      lines.push("## Dispatch", "", `\`npm run orgos -- skills run ${skill.cli_command}\``, "");
    } else if (skill && isAgentInteractiveSkill(skill)) {
      lines.push("## Dispatch", "", formatSkillReference(skill, "portable"), "");
    }
  }

  if (handoff.notes) {
    lines.push("## Notes", "", handoff.notes, "");
  }

  return lines.join("\n");
}

export function formatSuggestCard(handoff: Handoff, matched?: MatchedRoute): string {
  const skillLine = handoff.skill ? ` · skill=${handoff.skill}` : "";
  const routeLine = handoff.route_id ? ` · route=${handoff.route_id}` : "";
  const accessLine = handoff.access.allowed ? "access=ok" : `access=blocked (${handoff.access.reason})`;
  const matchLine = matched ? ` · score=${matched.score}` : "";
  return `[handoff] ${handoff.from_agent} → ${handoff.to_agent}${skillLine}${routeLine} · ${accessLine}${matchLine}`;
}

export function routingQueueDir(): string {
  return ensureDocsReportsDir(ROUTING_QUEUE_SUBDIR);
}

export function writeHandoffFiles(handoff: Handoff, matched?: MatchedRoute): { yamlPath: string; mdPath: string } {
  const dir = routingQueueDir();
  const yamlPath = join(dir, `${handoff.id}.yaml`);
  const mdPath = join(dir, `${handoff.id}.md`);
  writeYamlFile(yamlPath, handoff);
  writeFileSync(mdPath, formatHandoffMarkdown(handoff, matched), "utf-8");
  appendAuditEvent({
    event: handoff.task_type === "implement" ? "escalate" : "handoff",
    ref: handoff.id,
    actor: handoff.from_agent,
    detail: `${handoff.from_agent} → ${handoff.to_agent}`,
  });
  return { yamlPath, mdPath };
}

export function loadHandoff(id: string): Handoff {
  const yamlPath = join(routingQueueDir(), `${id}.yaml`);
  if (!existsSync(yamlPath)) {
    throw new Error(`Handoff not found: ${id} (${yamlPath})`);
  }
  return readYamlFile(yamlPath, handoffSchema);
}

/** Load every child work order of a handoff (empty when it has none). */
export function loadHandoffChildren(handoff: Handoff): Handoff[] {
  return (handoff.child_ids ?? []).map((cid) => loadHandoff(cid));
}

export function listHandoffs(): Handoff[] {
  const dir = routingQueueDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => readYamlFile(join(dir, f), handoffSchema))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function resolveSkillCliCommand(skillId: string): string | undefined {
  const skill = loadSkillRegistry().find((s) => s.id === skillId);
  if (!skill || skill.runtime !== "cli") return undefined;
  return skill.cli_command;
}

export function validateRoutingRegistry(): string[] {
  const issues: string[] = [];
  const registry = loadRoutingRegistry();
  const skillIds = new Set(loadSkillRegistry().map((s) => s.id));
  const seen = new Set<string>();

  for (const route of registry.routes) {
    if (seen.has(route.id)) {
      issues.push(`duplicate route id: ${route.id}`);
    }
    seen.add(route.id);

    if (route.skill && !skillIds.has(route.skill)) {
      issues.push(`${route.id}: unknown skill ${route.skill}`);
    }
    if (route.resource_paths.length === 0) {
      issues.push(`${route.id}: resource_paths required for access check`);
    }
  }

  return issues;
}
