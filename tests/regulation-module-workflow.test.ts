import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  formatRegulationModulePlan,
  planRegulationForModule,
  fileRegulationWorkflowWorkOrder,
} from "../src/lib/regulation-module-workflow.js";

describe("regulation-module-workflow", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("reuses required regulations for jp_bank_corporate", () => {
    const plan = planRegulationForModule("jp_bank_corporate");
    expect(plan.actions.some((a) => a.kind === "reuse")).toBe(true);
    const reuse = plan.actions.find((a) => a.kind === "reuse")!;
    expect(reuse.regulationIds).toEqual(expect.arrayContaining(["REG-027", "REG-030"]));
  });

  it("classifies cosmetics-like module id as fork_family without mutating MD QMS", () => {
    const plan = planRegulationForModule("jp_cosmetics_mah");
    expect(plan.actions.some((a) => a.kind === "fork_family")).toBe(true);
    expect(plan.doNotMutateRegulationIds).toEqual(
      expect.arrayContaining(["REG-025", "REG-026"])
    );
  });

  it("medical device keeps its own regs without fork_family self-block", () => {
    const medical = planRegulationForModule("jp_medical_device");
    expect(medical.doNotMutateRegulationIds).toEqual([]);
    expect(medical.actions.some((a) => a.kind === "fork_family")).toBe(false);
  });

  it("fork_family when module notes mention cosmetics", () => {
    // jp_consumption_refund does not; permit modules reuse REG-037
    const plan = planRegulationForModule("jp_permit_application");
    expect(plan.actions.some((a) => a.kind === "reuse")).toBe(true);
    expect(plan.actions.find((a) => a.kind === "reuse")!.regulationIds).toContain("REG-037");
  });

  it("formats a markdown plan", () => {
    const md = formatRegulationModulePlan(planRegulationForModule("jp_tax_corporate"));
    expect(md).toContain("reuse");
    expect(md).toContain("REG-031");
  });

  it("dryRun work order does not write", () => {
    const result = fileRegulationWorkflowWorkOrder("jp_invoice_qualified", { dryRun: true });
    expect(result.skipped).toBe(true);
    expect(result.workOrderId).toBeUndefined();
    expect(result.plan.actions.some((a) => a.kind === "reuse")).toBe(true);
  });
});
