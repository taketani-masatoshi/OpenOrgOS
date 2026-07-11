import { describe, expect, it } from "vitest";
import {
  resolveRegisteredSkillInvocation,
  resolveSkillDispatch,
  SKILL_COMMANDS,
} from "../src/commands/skills.js";
import { validateSkillDispatchReachability } from "../src/lib/skill-dispatch-verify.js";
import { getCliSkills, loadSkillRegistry } from "../src/lib/skill-registry.js";

const DISPATCH_CONTRACT_TIMEOUT = 180_000;

describe("skill dispatch contract", () => {
  it(
    "registry CLI skills are reachable (ready · deferred · argv) with aligned cli_command",
    () => {
      const issues = validateSkillDispatchReachability(resolveRegisteredSkillInvocation);
      expect(issues).toEqual([]);

      for (const skill of getCliSkills()) {
        const byId = resolveSkillDispatch(skill.id);
        expect(byId.status, `${skill.id} by id`).not.toBe("unwired");

        if (skill.cli_command && !skill.deferred) {
          const byCli = resolveSkillDispatch(skill.cli_command);
          expect(byCli.status, `${skill.id} cli_command`).not.toBe("unwired");
          if ("skill" in byCli && byCli.skill) {
            expect(byCli.skill.id).toBe(skill.id);
          }
        }

        if (skill.handler && !skill.required_options?.length) {
          expect(byId.status, `${skill.id} handler`).toBe("ready");
        }
      }

      const registryById = new Map(loadSkillRegistry().map((entry) => [entry.id, entry]));
      for (const command of SKILL_COMMANDS) {
        const skill = registryById.get(command.skill);
        if (!skill || skill.runtime !== "cli") continue;
        expect(skill.handler ?? skill.argv ?? skill.deferred, command.skill).toBeTruthy();
        expect(resolveSkillDispatch(command.id).status).not.toBe("unwired");
      }
    },
    DISPATCH_CONTRACT_TIMEOUT
  );

  it("resolveSkillDispatch is the unified resolver alias", () => {
    const viaAlias = resolveSkillDispatch("contract-expiry");
    const viaCanonical = resolveRegisteredSkillInvocation("contract_expiry_check");
    expect(viaAlias.status).toBe("ready");
    expect(viaCanonical.status).toBe("ready");
    if (viaAlias.status === "ready" && viaCanonical.status === "ready") {
      expect(viaAlias.skill.id).toBe(viaCanonical.skill.id);
    }
  });

  it("required_options defer execution until options are supplied", () => {
    const deferred = resolveSkillDispatch("tenant_integrations_setup");
    expect(deferred.status).toBe("deferred");
    if (deferred.status === "deferred") {
      expect(deferred.missingOptions).toEqual(["answers"]);
    }
  });

  it("platform_implement_guide resolves via deprecated alias", () => {
    for (const input of ["platform_implement_guide", "platform-implement-guide"]) {
      const resolution = resolveSkillDispatch(input);
      expect(resolution.status).toBe("ready");
      if (resolution.status === "ready") {
        expect(resolution.skill.id).toBe("platform_implement_guide");
      }
    }
  });

  it("hospitality module handlers use canonical skill ids", () => {
    for (const input of ["operations_records", "records-check", "revpar_analysis", "revpar"]) {
      expect(resolveSkillDispatch(input).status).toBe("ready");
    }
  });
});
