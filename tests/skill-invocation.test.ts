import { describe, expect, it } from "vitest";
import { resolveRegisteredSkillInvocation } from "../src/commands/skills.js";
import { canonicalSkillId } from "../src/lib/skill-invocation.js";

describe("skill invocation resolver", () => {
  it(
    "resolves canonical core skill IDs and legacy CLI aliases to one handler",
    () => {
    expect(canonicalSkillId("contract_expiry_check")).toBe("contract_expiry_check");
    expect(canonicalSkillId("contract-expiry")).toBe("contract_expiry_check");

    const canonical = resolveRegisteredSkillInvocation("contract_expiry_check");
    const alias = resolveRegisteredSkillInvocation("contract-expiry");
    expect(canonical.status).toBe("ready");
    expect(alias.status).toBe("ready");
    if (canonical.status === "ready" && alias.status === "ready") {
      expect(canonical.skill.id).toBe("contract_expiry_check");
      expect(alias.skill.id).toBe(canonical.skill.id);
      expect(alias.argv).toEqual(["skills", "run", "contract-expiry"]);
    }
  },
    15_000
  );

  it("resolves JP Bank module handlers by canonical skill ID", () => {
    const invocation = resolveRegisteredSkillInvocation("jp-cashflow-schedule");
    expect(invocation.status).toBe("ready");
    if (invocation.status === "ready") {
      expect(invocation.skill.moduleId).toBe("jp_bank_corporate");
      expect(invocation.argv).toEqual(["skills", "run", "jp bank cashflow generate"]);
    }
  });

  it("preserves complete multiword argv without auto-executing it", () => {
    const invocation = resolveRegisteredSkillInvocation("jp_subsidy_eligibility");
    expect(invocation.status).toBe("deferred");
    if (invocation.status === "deferred") {
      expect(invocation.execution).toBe("argv");
      expect(invocation.argv).toEqual(["operations", "subsidy", "eligibility"]);
    }
  });

  it("classifies missing required options, agent runtime, and unknown skills safely", () => {
    const missing = resolveRegisteredSkillInvocation("tenant_integrations_setup");
    expect(missing.status).toBe("deferred");
    if (missing.status === "deferred") expect(missing.missingOptions).toEqual(["answers"]);

    expect(resolveRegisteredSkillInvocation("external_correspondence").status).toBe("agent");
    expect(resolveRegisteredSkillInvocation("not-a-skill").status).toBe("unwired");
  });

  it("marks parent and phantom CLI entries as explicitly deferred", () => {
    expect(resolveRegisteredSkillInvocation("coo_work_order_triage").status).toBe("deferred");
    expect(resolveRegisteredSkillInvocation("coo_routing_review").status).toBe("deferred");
    expect(resolveRegisteredSkillInvocation("jp_permit_obligations").status).toBe("deferred");
  });

  it("resolves JP tax module skills", () => {
    for (const id of [
      "jp_corporate_tax_return",
      "jp_consumption_tax_return",
      "jp_invoice_registration",
      "jp_qualified_invoice_issue",
      "jp_withholding_payment",
    ]) {
      const invocation = resolveRegisteredSkillInvocation(id);
      expect(invocation.status, id).toBe("ready");
    }
    expect(resolveRegisteredSkillInvocation("jp-corporate-tax-return").status).toBe("ready");
  });
});
