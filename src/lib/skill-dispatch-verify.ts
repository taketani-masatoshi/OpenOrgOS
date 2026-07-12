/**
 * Skill dispatch reachability — registry handler · argv · deferred classification.
 */

import type { SkillInvocationResolution } from "./skill-invocation.js";
import { getCliSkills } from "./skill-registry.js";

export type SkillDispatchResolver = (
  input: string,
  opts?: Record<string, unknown>
) => SkillInvocationResolution;

export function validateSkillDispatchReachability(resolve: SkillDispatchResolver): string[] {
  const issues: string[] = [];

  for (const skill of getCliSkills()) {
    const byId = resolve(skill.id);
    if (byId.status === "unwired") {
      issues.push(`${skill.id}: unwired by id — ${byId.reason}`);
    }

    if (skill.cli_command) {
      const byCli = resolve(skill.cli_command);
      if (byCli.status === "unwired") {
        issues.push(`${skill.id}: cli_command "${skill.cli_command}" unwired — ${byCli.reason}`);
      } else if (skill.deferred) {
        if (byId.status !== "deferred") {
          issues.push(`${skill.id}: deferred skill expected deferred by id, got ${byId.status}`);
        }
      } else if ("skill" in byCli && byCli.skill?.id !== skill.id) {
        issues.push(
          `${skill.id}: cli_command "${skill.cli_command}" resolves to ${byCli.skill?.id}`
        );
      }
    }

    if (skill.handler) {
      if (!skill.required_options?.length && byId.status !== "ready") {
        issues.push(`${skill.id}: handler "${skill.handler}" expected ready, got ${byId.status}`);
      }
      if (skill.handler !== skill.id) {
        issues.push(`${skill.id}: handler must equal canonical skill id`);
      }
    } else if (skill.deferred) {
      if (byId.status !== "deferred") {
        issues.push(`${skill.id}: deferred skill expected deferred, got ${byId.status}`);
      }
    } else if (skill.argv) {
      if (byId.status !== "deferred" || byId.execution !== "argv") {
        issues.push(`${skill.id}: argv skill expected deferred/argv, got ${byId.status}`);
      }
    }
  }

  return issues;
}
