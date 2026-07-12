/**
 * Skill execution mode — delegation map as code (event-first route dispatch).
 */

import type { AgentId } from "../../schemas/classification.js";
import type { SkillRunOptions } from "../commands/skills.js";
import { resolveAgentId } from "./agent-catalog.js";
import { canonicalSkillId, type SkillInvocationResolution } from "./skill-invocation.js";
import {
  getSkillById,
  type ResolvedSkillEntry,
} from "./skill-registry.js";
import { MODULE_TO_CLASSIFICATION_AGENT, loadEnabledModules, type ModuleAgentId } from "./modules.js";

export type SkillExecutionMode =
  | "direct_auto"
  | "delegate_work_order"
  | "agent_interactive"
  | "human_approval"
  | "deferred"
  | "escalate";

export interface SkillExecutionContext {
  fromAgent: string;
  toAgent: AgentId;
}

export interface SkillExecutionPlan {
  mode: SkillExecutionMode;
  skillId?: string;
  executingAgentId?: AgentId;
  registryAgentId?: AgentId;
  reason: string;
}

export const STEWARD_SELF_EXECUTE_SKILLS = new Set([
  "executive_dashboard",
  "daily_ops",
  "p0_closing",
]);

/** Recommended executing agent overrides — steward/core/orchestrators/skill_delegation_map.md */
const EXECUTING_AGENT_OVERRIDES: Partial<Record<string, AgentId>> = {
  tax_filing_prep: "tax",
  jp_company_incorporation: "legal",
  jp_registry_change: "legal",
  jp_subsidy_eligibility: "government_affairs",
  jp_subsidy_labor_cost: "government_affairs",
  jp_subsidy_draft: "government_affairs",
  jp_trademark_checklist: "intellectual_property",
  jp_trademark_draft: "intellectual_property",
};

const HUMAN_APPROVAL_SKILL_PATTERN =
  /(?:^|_)(?:wire_(?:send|transmit)|send_wire|protocol_notice_approve|approval|approve|broker_transfer)(?:_|$)/;

export function isHumanApprovalSkill(skillId: string): boolean {
  const normalized = skillId.toLowerCase().replace(/[\s-]+/g, "_");
  return HUMAN_APPROVAL_SKILL_PATTERN.test(normalized);
}

export function isModuleSkillEnabled(skill: ResolvedSkillEntry): boolean {
  if (!skill.moduleId) return true;
  return loadEnabledModules().some((entry) => entry.agent === skill.moduleId);
}

export function resolveExecutingAgentId(skill: ResolvedSkillEntry): AgentId {
  const override = EXECUTING_AGENT_OVERRIDES[skill.id];
  if (override) return override;

  if (skill.moduleId && skill.runtime === "agent") {
    const mapped = MODULE_TO_CLASSIFICATION_AGENT[skill.moduleId as ModuleAgentId];
    if (mapped) return mapped;
  }

  return skill.agent_id;
}

export function resolveSkillExecutionMode(
  skillInput: string | undefined,
  ctx: SkillExecutionContext,
  resolution?: SkillInvocationResolution
): SkillExecutionPlan {
  if (!skillInput) {
    return { mode: "escalate", reason: "no skill specified — use route match or escalate plan" };
  }

  const skillId = canonicalSkillId(skillInput) ?? skillInput;
  const skill = getSkillById(skillId);
  if (!skill) {
    return { mode: "escalate", reason: `unknown skill: ${skillInput}` };
  }

  const executingAgentId = resolveExecutingAgentId(skill);
  const base = {
    skillId: skill.id,
    executingAgentId,
    registryAgentId: skill.agent_id,
  };

  if (isHumanApprovalSkill(skill.id)) {
    return {
      ...base,
      mode: "human_approval",
      reason: "wire transmission and approval operations require an explicit human gate",
    };
  }

  if (skill.runtime === "agent") {
    return {
      ...base,
      mode: "agent_interactive",
      reason: `${skill.id} uses agent runtime — Work Order + skill attachment`,
    };
  }

  if (resolution?.status === "agent") {
    return { ...base, mode: "agent_interactive", reason: resolution.reason };
  }
  if (resolution?.status === "unwired") {
    return { ...base, mode: "escalate", reason: resolution.reason };
  }
  if (resolution?.status === "deferred" || skill.deferred || skill.argv) {
    return {
      ...base,
      mode: "deferred",
      reason:
        resolution?.status === "deferred"
          ? resolution.reason
          : skill.deferred ?? "explicit argv/parent command requires manual dispatch",
    };
  }

  if (skill.moduleId && !isModuleSkillEnabled(skill)) {
    return {
      ...base,
      mode: "escalate",
      reason: `module ${skill.moduleId} is not enabled for this tenant`,
    };
  }

  if (STEWARD_SELF_EXECUTE_SKILLS.has(skill.id)) {
    if (ctx.toAgent === "executive_steward") {
      return { ...base, mode: "direct_auto", reason: "steward self-execute skill" };
    }
    return {
      ...base,
      mode: "delegate_work_order",
      executingAgentId: "executive_steward",
      reason: "delegate steward self-execute skill to executive_steward",
    };
  }

  if (ctx.toAgent === executingAgentId) {
    return { ...base, mode: "direct_auto", reason: "authority aligned with executing agent" };
  }

  return {
    ...base,
    mode: "delegate_work_order",
    reason: `to_agent ${ctx.toAgent} does not match executing agent ${executingAgentId}`,
  };
}

export type SkillExecutionResolver = (
  skillId: string,
  opts?: SkillRunOptions
) => SkillInvocationResolution;

export function resolveSkillExecutionPlan(
  skillInput: string | undefined,
  ctx: SkillExecutionContext,
  resolveInvocation: SkillExecutionResolver,
  opts: SkillRunOptions = {}
): SkillExecutionPlan & { resolution?: SkillInvocationResolution } {
  const resolution = skillInput ? resolveInvocation(skillInput, opts) : undefined;
  const plan = resolveSkillExecutionMode(skillInput, ctx, resolution);
  return { ...plan, resolution };
}

export function validateSkillExecutionOverrides(): string[] {
  const issues: string[] = [];
  for (const [skillId, agentId] of Object.entries(EXECUTING_AGENT_OVERRIDES)) {
    if (!getSkillById(skillId)) {
      issues.push(`execution override references missing skill: ${skillId}`);
    }
    if (!resolveAgentId(agentId)) {
      issues.push(`execution override ${skillId}: unknown agent ${agentId}`);
    }
  }
  return issues;
}
