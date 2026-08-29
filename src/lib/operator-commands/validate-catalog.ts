import { getChatEnabledSkills, clearSkillRegistryCache } from "../skill-registry.js";
import { resolveRegisteredSkillInvocation } from "../../commands/skills.js";
import { matchRoutes, loadRoutingRegistry } from "../routing.js";

export type ChatCatalogIssue = {
  level: "error" | "warning";
  file: string;
  message: string;
};

const KNOWN_PERMISSIONS = new Set([
  "chat:read",
  "chat:ask",
  "chat:approve",
  "chat:wire",
  "protocol:approve",
  "protocol:draft",
  "broker:transfer",
  "finance:reconcile",
  "scheduling:write",
  "scheduling:approve",
  "escalate:plan",
  "escalate:run",
  "escalate:complete",
  "agent:dispatch",
  "agent:order",
  "agent:report",
  "agent:shell",
  "git:write",
  "audit:read",
  "llm:admin",
  "llm:approve",
  "receipt:issue",
  "events:write",
  "guard:admin",
]);

/**
 * Integrity checks for chat-enabled skill catalog (`chat.enabled` blocks).
 */
export function validateChatCommandCatalog(): ChatCatalogIssue[] {
  clearSkillRegistryCache();
  const issues: ChatCatalogIssue[] = [];
  const file = "steward/core/skills/registry.yaml";
  const registry = loadRoutingRegistry();
  const routeSkillIds = new Set(
    registry.routes.map((r) => r.skill).filter((s): s is string => Boolean(s))
  );

  for (const skill of getChatEnabledSkills()) {
    const chat = skill.chat!;
    if (skill.runtime !== "cli") {
      issues.push({
        level: "error",
        file,
        message: `${skill.id}: chat.enabled requires runtime: cli`,
      });
    }
    if (!KNOWN_PERMISSIONS.has(chat.permission)) {
      issues.push({
        level: "error",
        file,
        message: `${skill.id}: unknown chat.permission ${chat.permission}`,
      });
    }
    if (chat.kind === "approval" && chat.permission === "chat:read") {
      issues.push({
        level: "error",
        file,
        message: `${skill.id}: approval kind must not use chat:read`,
      });
    }
    if (chat.kind === "write" && chat.permission === "chat:read") {
      issues.push({
        level: "warning",
        file,
        message: `${skill.id}: write kind with chat:read — prefer chat:approve or escalate:run`,
      });
    }
    if (chat.kind !== "approval") {
      const resolution = resolveRegisteredSkillInvocation(skill.id, {});
      if (resolution.status === "unwired") {
        issues.push({
          level: "error",
          file,
          message: `${skill.id}: chat-enabled skill handler not registered (${resolution.reason})`,
        });
      }
    }
    if (!routeSkillIds.has(skill.id)) {
      issues.push({
        level: "error",
        file,
        message: `${skill.id}: chat.enabled but no route in steward/core/routing/registry.yaml`,
      });
    } else {
      const route = registry.routes.find((r) => r.skill === skill.id);
      const keyword = route?.match.keywords[0];
      if (keyword) {
        const hits = matchRoutes({ text: keyword }).filter((m) => m.route.skill === skill.id);
        if (!hits.length) {
          issues.push({
            level: "warning",
            file,
            message: `${skill.id}: keyword "${keyword}" did not match its own route`,
          });
        }
      }
    }
  }

  return issues;
}
