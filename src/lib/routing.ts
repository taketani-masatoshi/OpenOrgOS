import { existsSync, readdirSync, writeFileSync } from "node:fs";
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
import { loadSkillRegistry } from "./skill-registry.js";
import { formatSkillReference, isAgentInteractiveSkill } from "./agent-portability.js";
import { appendAuditEvent } from "./audit-log.js";
import { getClock, getIdGenerator } from "./runtime-context.js";
import { currentDate, ensureDocsReportsDir, readYamlFile, writeYamlFile } from "./utils.js";
import { getCatalogAgent, isAgentActive, resolveAgentId } from "./agent-catalog.js";

export { ROUTING_REGISTRY_PATH };
export const ROUTING_QUEUE_SUBDIR = "routing-queue";

const EXECUTIVE_DATA_PREFIXES = ["data/executive/", "docs/executive/"];

export interface RouteMatchInput {
  text?: string;
  path?: string;
  profile?: "operational" | "developer" | "task";
}

export interface MatchedRoute {
  route: RouteDefinition;
  score: number;
  matchedBy: string[];
  access: AccessCheckResult;
  moduleEnabled: boolean;
  boundaryOk: boolean;
  skillAvailable: boolean;
  /** Human-readable reasons when the route is not eligible for dispatch. */
  blockedReasons: string[];
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

function isModuleAgentEnabled(
  agent: AgentId,
  profile: "operational" | "developer" | "task" = "operational"
): boolean {
  if (getCatalogAgent(agent) && !["property_rental", "hospitality"].includes(agent)) {
    return isAgentActive(agent, { profile, mode: "consult" });
  }
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
    if (result.allowed) continue;
    if (result.reason.startsWith("未登録リソース")) {
      return {
        ...result,
        reason: `${result.reason} — orgos tenant align-classification でテンプレート資源をマージ`,
      };
    }
    return result;
  }
  return { allowed: true, reason: "ok" };
}

export function checkExecutiveBoundary(route: RouteDefinition, inputPath?: string): boolean {
  const path = inputPath ? normalizeResourcePath(inputPath) : undefined;
  const executiveData = path ? isExecutiveDataPath(path) : false;
  const allowedAgent = getCatalogAgent(route.agent)?.access.read.some((pattern) =>
    EXECUTIVE_DATA_PREFIXES.some(
      (prefix) => pathMatchesPattern(prefix, pattern) || pathMatchesPattern(pattern, prefix)
    )
  );

  if (executiveData) {
    return route.agent === "secretary" || allowedAgent === true;
  }

  if (route.boundary === "executive_data" && route.agent !== "secretary" && !allowedAgent) {
    return false;
  }

  return true;
}

function isSkillAvailable(skillId?: string): boolean {
  if (!skillId) return true;
  return loadSkillRegistry().some((s) => s.id === skillId);
}

function scoreRoute(
  route: RouteDefinition,
  input: RouteMatchInput
): { score: number; matchedBy: string[] } {
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

function collectBlockedReasons(input: {
  route: RouteDefinition;
  access: AccessCheckResult;
  moduleEnabled: boolean;
  boundaryOk: boolean;
  skillAvailable: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!input.access.allowed) {
    reasons.push(`access: ${input.access.reason}`);
  }
  if (!input.moduleEnabled) {
    reasons.push(
      `agent ${input.route.agent} inactive — enable with: orgos agent roster enable --agent ${input.route.agent}`
    );
  }
  if (!input.boundaryOk) {
    reasons.push("executive boundary violation");
  }
  if (!input.skillAvailable && input.route.skill) {
    reasons.push(`skill unavailable: ${input.route.skill}`);
  }
  return reasons;
}

export function matchRoutes(
  input: RouteMatchInput,
  registry = loadRoutingRegistry()
): MatchedRoute[] {
  const results: MatchedRoute[] = [];
  const profile = input.profile ?? "operational";
  const routeProfile = profile === "task" ? "operational" : profile;

  for (const route of registry.routes) {
    if (!route.profiles.includes(routeProfile)) continue;
    const { score, matchedBy } = scoreRoute(route, input);
    if (matchedBy.length === 0) continue;

    const access = checkRouteAccess(route.agent, route.resource_paths);
    const moduleEnabled = route.module_agent
      ? isModuleAgentEnabled(route.agent, profile)
      : isAgentActive(route.agent, { profile, mode: "consult" });
    const boundaryOk = checkExecutiveBoundary(route, input.path);
    const skillAvailable = isSkillAvailable(route.skill);
    const blockedReasons = collectBlockedReasons({
      route,
      access,
      moduleEnabled,
      boundaryOk,
      skillAvailable,
    });

    results.push({
      route,
      score,
      matchedBy,
      access,
      moduleEnabled,
      boundaryOk,
      skillAvailable,
      blockedReasons,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

export function pickBestRoute(
  input: RouteMatchInput,
  registry = loadRoutingRegistry()
): MatchedRoute | undefined {
  const eligible = matchRoutes(input, registry).filter(
    (m) => m.access.allowed && m.moduleEnabled && m.boundaryOk
  );
  return eligible[0];
}

export function generateHandoffId(): string {
  const stamp = currentDate().replace(/-/g, "");
  const suffix = getIdGenerator().randomSuffix(6);
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
    created_at: getClock().nowIso(),
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
    lines.push(
      "## Match",
      "",
      `- score: ${matched.score}`,
      `- matched: ${matched.matchedBy.join(", ")}`,
      ""
    );
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

  if (handoff.invocation) {
    lines.push(
      "## Invocation",
      "",
      `- decision: ${handoff.invocation.decision}`,
      `- status: ${handoff.invocation.status}`,
      `- attempts: ${handoff.invocation.attempts}`,
      `- required_arguments: ${handoff.invocation.required_arguments.join(", ") || "—"}`,
      `- missing_arguments: ${handoff.invocation.missing_arguments.join(", ") || "—"}`,
      `- result: ${handoff.invocation.result ?? "—"}`,
      `- failure_reason: ${handoff.invocation.failure_reason ?? "—"}`,
      ""
    );
  }

  return lines.join("\n");
}

export function formatSuggestCard(handoff: Handoff, matched?: MatchedRoute): string {
  const skillLine = handoff.skill ? ` · skill=${handoff.skill}` : "";
  const routeLine = handoff.route_id ? ` · route=${handoff.route_id}` : "";
  const accessLine = handoff.access.allowed
    ? "access=ok"
    : `access=blocked (${handoff.access.reason})`;
  const matchLine = matched ? ` · score=${matched.score}` : "";
  const blocked =
    matched && matched.blockedReasons.length
      ? `\n  blocked: ${matched.blockedReasons.join("; ")}`
      : "";
  return `[handoff] ${handoff.from_agent} → ${handoff.to_agent}${skillLine}${routeLine} · ${accessLine}${matchLine}${blocked}`;
}

export function routingQueueDir(): string {
  return ensureDocsReportsDir(ROUTING_QUEUE_SUBDIR);
}

export function writeHandoffFiles(
  handoff: Handoff,
  matched?: MatchedRoute,
  options: { audit?: boolean } = {}
): { yamlPath: string; mdPath: string } {
  const dir = routingQueueDir();
  const yamlPath = join(dir, `${handoff.id}.yaml`);
  const mdPath = join(dir, `${handoff.id}.md`);
  writeYamlFile(yamlPath, handoff);
  writeFileSync(mdPath, formatHandoffMarkdown(handoff, matched), "utf-8");
  if (options.audit !== false) {
    appendAuditEvent({
      event: handoff.task_type === "implement" ? "escalate" : "handoff",
      ref: handoff.id,
      actor: handoff.from_agent,
      detail: `${handoff.from_agent} → ${handoff.to_agent}`,
    });
  }
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

export function validateRoutingRegistry(): string[] {
  const issues: string[] = [];
  const registry = loadRoutingRegistry();
  const skillsById = new Map(loadSkillRegistry().map((skill) => [skill.id, skill]));
  const seen = new Set<string>();

  for (const route of registry.routes) {
    if (seen.has(route.id)) {
      issues.push(`duplicate route id: ${route.id}`);
    }
    seen.add(route.id);

    if (!resolveAgentId(route.agent)) {
      issues.push(`${route.id}: unknown agent ${route.agent}`);
    }

    if (route.skill && !skillsById.has(route.skill)) {
      issues.push(`${route.id}: unknown skill ${route.skill}`);
    } else if (route.skill) {
      const skill = skillsById.get(route.skill);
      if (skill && resolveAgentId(skill.agent_id) !== resolveAgentId(route.agent)) {
        issues.push(
          `${route.id}: skill owner ${skill.agent_id} does not match route agent ${route.agent}`
        );
      }
    }
    if (route.resource_paths.length === 0) {
      issues.push(`${route.id}: resource_paths required for access check`);
    }
  }

  return issues;
}
