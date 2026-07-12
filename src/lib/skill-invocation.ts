import type { SkillRunOptions } from "../commands/skills.js";
import {
  getSkillByCliCommand,
  getSkillById,
  type ResolvedSkillEntry,
} from "./skill-registry.js";

export type SkillHandler = (opts: SkillRunOptions) => void | Promise<void>;

export interface SkillInvocationHandlers {
  core: Readonly<Record<string, SkillHandler>>;
  module: Readonly<Record<string, SkillHandler>>;
}

export type SkillInvocationResolution =
  | {
      status: "ready";
      execution: "handler";
      skill: ResolvedSkillEntry;
      handler: SkillHandler;
      argv: string[];
    }
  | {
      status: "deferred";
      execution: "handler" | "argv" | "deferred";
      skill: ResolvedSkillEntry;
      reason: string;
      argv?: string[];
      missingOptions?: string[];
    }
  | {
      status: "agent";
      execution: "agent";
      skill: ResolvedSkillEntry;
      reason: string;
    }
  | {
      status: "unwired";
      execution: "unwired";
      skill?: ResolvedSkillEntry;
      reason: string;
    };

function hasOption(opts: SkillRunOptions, name: string): boolean {
  const value = (opts as unknown as Record<string, unknown>)[name];
  return value !== undefined && value !== null && value !== "";
}

export function canonicalSkillId(input: string): string | undefined {
  const byId = getSkillById(input);
  if (byId) return byId.id;
  return getSkillByCliCommand(input)?.id;
}

export function resolveSkillInvocation(
  input: string,
  opts: SkillRunOptions,
  handlers: SkillInvocationHandlers
): SkillInvocationResolution {
  const id = canonicalSkillId(input);
  const skill = id ? getSkillById(id) : undefined;
  if (!skill) {
    return { status: "unwired", execution: "unwired", reason: `unknown skill: ${input}` };
  }
  if (skill.runtime !== "cli") {
    return {
      status: "agent",
      execution: "agent",
      skill,
      reason: `${skill.id} uses agent runtime`,
    };
  }
  if (skill.deferred) {
    return {
      status: "deferred",
      execution: "deferred",
      skill,
      reason: skill.deferred,
    };
  }
  if (skill.argv) {
    return {
      status: "deferred",
      execution: "argv",
      skill,
      argv: [...skill.argv],
      reason: "explicit CLI argv has no typed in-process handler; manual dispatch required",
    };
  }
  if (!skill.handler) {
    return {
      status: "unwired",
      execution: "unwired",
      skill,
      reason: `${skill.id} has no handler, argv, or deferred classification`,
    };
  }

  const missingOptions = (skill.required_options ?? []).filter((name) => !hasOption(opts, name));
  if (missingOptions.length) {
    return {
      status: "deferred",
      execution: "handler",
      skill,
      argv: ["skills", "run", skill.cli_command ?? skill.id],
      missingOptions,
      reason: `missing required options: ${missingOptions.join(", ")}`,
    };
  }

  const handler = handlers.core[skill.handler] ?? handlers.module[skill.handler];
  if (!handler) {
    return {
      status: "unwired",
      execution: "unwired",
      skill,
      reason: `handler not registered: ${skill.handler}`,
    };
  }
  return {
    status: "ready",
    execution: "handler",
    skill,
    handler,
    argv: ["skills", "run", skill.cli_command ?? skill.id],
  };
}
