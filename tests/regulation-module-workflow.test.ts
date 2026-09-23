import { describe, expect, it, beforeEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { checkModuleRegulationContract } from "../src/lib/regulation-module-contract.js";
import {
  formatRegulationModulePlan,
  planRegulationForModule,
  fileRegulationWorkflowWorkOrder,
  isThinStubTemplate,
  regulationWorkflowSubject,
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

  it("classifies cosmetics-like module id as fork_family with qms_gxp scaffold", () => {
    const plan = planRegulationForModule("jp_cosmetics_mah");
    expect(plan.familyId).toBe("qms_gxp");
    const fork = plan.actions.find((a) => a.kind === "fork_family")!;
    expect(fork.draftTemplate).toContain("qms-gxp/FORK-DRAFT.md");
    expect(plan.doNotMutateRegulationIds).toEqual(
      expect.arrayContaining(["REG-025", "REG-026"])
    );
  });

  it("medical device is family owner without fork_family", () => {
    const medical = planRegulationForModule("jp_medical_device");
    expect(medical.familyId).toBe("qms_gxp");
    expect(medical.doNotMutateRegulationIds).toEqual([]);
    expect(medical.actions.some((a) => a.kind === "fork_family")).toBe(false);
    expect(medical.actions.some((a) => a.kind === "reuse")).toBe(true);
  });

  it("permit modules reuse REG-037", () => {
    const plan = planRegulationForModule("jp_permit_application");
    expect(plan.actions.some((a) => a.kind === "reuse")).toBe(true);
    expect(plan.actions.find((a) => a.kind === "reuse")!.regulationIds).toContain("REG-037");
  });

  it("detects thin stubs beyond line count", () => {
    const stub = `# x\n\n## 第1条（目的）\na\n\n## 第2条（適用範囲）\nb\n\n## 第3条（責任）\nc\n`;
    expect(isThinStubTemplate(stub)).toBe(true);
    const thick = stub + "\n## 第4条（手続）\n…\n".repeat(20) + "\n## 別紙1\nx\n";
    expect(isThinStubTemplate(thick)).toBe(false);
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
  });

  it("dedupes pending regulation workflow work orders", () => {
    const first = fileRegulationWorkflowWorkOrder("jp_tax_corporate", { dedupe: false });
    expect(first.workOrderId).toBeTruthy();
    expect(first.deduped).not.toBe(true);
    const second = fileRegulationWorkflowWorkOrder("jp_tax_corporate");
    expect(second.deduped).toBe(true);
    expect(second.workOrderId).toBe(first.workOrderId);
    expect(second.skipped).toBe(true);
    expect(regulationWorkflowSubject("jp_tax_corporate")).toContain("jp_tax_corporate");
  });
});

describe("regulation-module-contract", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("accepts jp_bank_corporate regulation references", () => {
    expect(checkModuleRegulationContract("jp_bank_corporate")).toEqual([]);
  });

  it("accepts jp_medical_device family owner", () => {
    expect(checkModuleRegulationContract("jp_medical_device")).toEqual([]);
  });
});
