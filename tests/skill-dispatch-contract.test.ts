import { describe, expect, it } from "vitest";
import {
  resolveRegisteredSkillInvocation,
  resolveSkillDispatch,
  SKILL_COMMANDS,
} from "../src/commands/skills.js";
import { validateSkillDispatchReachability } from "../src/lib/skill-dispatch-verify.js";
import { getCliSkills, loadSkillRegistry } from "../src/lib/skill-registry.js";

describe("skill dispatch contract", () => {
  it("validateSkillDispatchReachability reports no issues", () => {
    const issues = validateSkillDispatchReachability(resolveRegisteredSkillInvocation);
    expect(issues).toEqual([]);
  });

  it("resolveSkillDispatch is the unified resolver alias", () => {
    const viaAlias = resolveSkillDispatch("contract-expiry");
    const viaCanonical = resolveRegisteredSkillInvocation("contract_expiry_check");
    expect(viaAlias.status).toBe("ready");
    expect(viaCanonical.status).toBe("ready");
    if (viaAlias.status === "ready" && viaCanonical.status === "ready") {
      expect(viaAlias.skill.id).toBe(viaCanonical.skill.id);
    }
  });

  it("every CLI skill resolves by id without unwired status", () => {
    for (const skill of getCliSkills()) {
      const resolution = resolveSkillDispatch(skill.id);
      expect(resolution.status, `${skill.id} should not be unwired`).not.toBe("unwired");
    }
  });

  it("every CLI cli_command resolves to the same canonical skill", () => {
    for (const skill of getCliSkills()) {
      if (!skill.cli_command) continue;
      const byCli = resolveSkillDispatch(skill.cli_command);
      expect(byCli.status, `${skill.id} cli_command`).not.toBe("unwired");
      if ("skill" in byCli && byCli.skill) {
        expect(byCli.skill.id).toBe(skill.id);
      }
    }
  });

  it("handler skills without required_options are ready", () => {
    const handlerSkills = getCliSkills().filter(
      (skill) => skill.handler && !(skill.required_options?.length)
    );
    expect(handlerSkills.length).toBeGreaterThan(0);
    for (const skill of handlerSkills) {
      expect(resolveSkillDispatch(skill.id).status).toBe("ready");
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
      const resolution = resolveSkillDispatch(input);
      expect(resolution.status).toBe("ready");
    }
  });

  it("SKILL_COMMANDS core entries align with registry handler metadata", () => {
    const registryById = new Map(loadSkillRegistry().map((skill) => [skill.id, skill]));
    for (const command of SKILL_COMMANDS) {
      const skill = registryById.get(command.skill);
      if (!skill || skill.runtime !== "cli") continue;
      expect(skill.handler ?? skill.argv ?? skill.deferred, command.skill).toBeTruthy();
      const resolution = resolveSkillDispatch(command.id);
      expect(resolution.status).not.toBe("unwired");
    }
  });
});
