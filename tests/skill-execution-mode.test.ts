import { describe, expect, it } from "vitest";
import {
  resolveExecutingAgentId,
  resolveSkillExecutionMode,
  STEWARD_SELF_EXECUTE_SKILLS,
  validateSkillExecutionOverrides,
} from "../src/lib/skill-execution-mode.js";
import { getSkillById } from "../src/lib/skill-registry.js";

describe("skill execution mode", () => {
  it("validateSkillExecutionOverrides reports no issues", () => {
    expect(validateSkillExecutionOverrides()).toEqual([]);
  });

  it("maps delegation overrides to recommended executing agents", () => {
    const tax = getSkillById("tax_filing_prep");
    const jpLegal = getSkillById("jp_company_incorporation");
    expect(tax && resolveExecutingAgentId(tax)).toBe("tax");
    expect(jpLegal && resolveExecutingAgentId(jpLegal)).toBe("legal");
  });

  it("allows direct_auto when to_agent matches executing agent", () => {
    const plan = resolveSkillExecutionMode("monthly_close", {
      fromAgent: "steward",
      toAgent: "finance",
    });
    expect(plan.mode).toBe("direct_auto");
    expect(plan.executingAgentId).toBe("finance");
  });

  it("requires work order when authority is misaligned", () => {
    const plan = resolveSkillExecutionMode("monthly_close", {
      fromAgent: "steward",
      toAgent: "secretary",
    });
    expect(plan.mode).toBe("delegate_work_order");
    expect(plan.executingAgentId).toBe("finance");
  });

  it("classifies steward self-execute skills", () => {
    for (const skillId of STEWARD_SELF_EXECUTE_SKILLS) {
      const direct = resolveSkillExecutionMode(skillId, {
        fromAgent: "executive_steward",
        toAgent: "executive_steward",
      });
      expect(direct.mode).toBe("direct_auto");

      const delegate = resolveSkillExecutionMode(skillId, {
        fromAgent: "steward",
        toAgent: "secretary",
      });
      expect(delegate.mode).toBe("delegate_work_order");
    }
  });

  it("routes agent runtime skills to agent_interactive", () => {
    const plan = resolveSkillExecutionMode("external_correspondence", {
      fromAgent: "steward",
      toAgent: "secretary",
    });
    expect(plan.mode).toBe("agent_interactive");
  });

  it("routes deferred argv skills without auto execution", () => {
    const plan = resolveSkillExecutionMode("jp_subsidy_eligibility", {
      fromAgent: "steward",
      toAgent: "finance",
    });
    expect(plan.mode).toBe("deferred");
  });
});
