import { describe, expect, it, beforeEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getTenantDir } from "../src/lib/tenant.js";
import {
  checkManifestRegulationContract,
  checkModuleRegulationContract,
  isRegulationRiskModuleId,
  listRegulationFamilyIds,
} from "../src/lib/regulation-module-contract.js";
import { scaffoldRegulationDraftFiles } from "../src/lib/regulation-draft-scaffold.js";
import {
  formatRegulationModulePlan,
  planRegulationForModule,
  fileRegulationWorkflowWorkOrder,
  isThinStubTemplate,
  regulationWorkflowSubject,
} from "../src/lib/regulation-module-workflow.js";
import { loadHandoff } from "../src/lib/routing.js";

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

  it("classifies jp_cosmetics_mah via regulation_family sibling with REG-038", () => {
    const plan = planRegulationForModule("jp_cosmetics_mah");
    expect(plan.familyId).toBe("qms_gxp");
    expect(plan.actions.find((a) => a.kind === "reuse")!.regulationIds).toEqual(
      expect.arrayContaining(["REG-038", "REG-037"])
    );
    const fork = plan.actions.find((a) => a.kind === "fork_family")!;
    expect(fork.draftTemplate).toContain("qms-gxp/FORK-DRAFT.md");
    expect(plan.doNotMutateRegulationIds).toEqual(
      expect.arrayContaining(["REG-025", "REG-026"])
    );
  });

  it("medical device is family owner without fork_family or perpetual thicken", () => {
    const medical = planRegulationForModule("jp_medical_device");
    expect(medical.familyId).toBe("qms_gxp");
    expect(medical.doNotMutateRegulationIds).toEqual([]);
    expect(medical.actions.some((a) => a.kind === "fork_family")).toBe(false);
    expect(medical.actions.some((a) => a.kind === "thicken")).toBe(false);
    expect(medical.actions.some((a) => a.kind === "reuse")).toBe(true);
  });

  it("permit modules reuse REG-037", () => {
    const plan = planRegulationForModule("jp_permit_application");
    expect(plan.actions.some((a) => a.kind === "reuse")).toBe(true);
    expect(plan.actions.find((a) => a.kind === "reuse")!.regulationIds).toContain("REG-037");
  });

  it("jsox reuses REG-016 and REG-027", () => {
    const plan = planRegulationForModule("jp_jsox");
    const reuse = plan.actions.find((a) => a.kind === "reuse")!;
    expect(reuse.regulationIds).toEqual(expect.arrayContaining(["REG-016", "REG-027"]));
  });

  it("tax modules optionally reference REG-030", () => {
    const plan = planRegulationForModule("jp_tax_corporate");
    const reuse = plan.actions.find((a) => a.kind === "reuse")!;
    expect(reuse.regulationIds).toEqual(expect.arrayContaining(["REG-031", "REG-030"]));
  });

  it("detects thin stubs beyond line count", () => {
    const stub = `# x\n\n## 第1条（目的）\na\n\n## 第2条（適用範囲）\nb\n\n## 第3条（責任）\nc\n`;
    expect(isThinStubTemplate(stub)).toBe(true);
    const thick =
      stub +
      "\n## 第4条（手続）\n…\n".repeat(2) +
      "\n## 別紙1\nx\n";
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

  it("scaffolds draft files without mutating medical 施行文", () => {
    const plan = planRegulationForModule("jp_cosmetics_mah");
    const draftRel = `docs/company/regulations/drafts/jp_cosmetics_mah-fork_family-草案.md`;
    const draftAbs = join(getTenantDir(), ...draftRel.split("/"));
    if (existsSync(draftAbs)) rmSync(draftAbs);

    const scaffold = scaffoldRegulationDraftFiles(plan, { force: true });
    expect(scaffold.created).toContain(draftRel);
    expect(existsSync(draftAbs)).toBe(true);
    const body = readFileSync(draftAbs, "utf-8");
    expect(body).toContain("未施行");
    expect(body).toContain("REG-025");
    expect(body).toContain("Pack path:");
    expect(body).not.toContain("## 推奨アウトプット構成");

    const seiko = join(getTenantDir(), "docs/company/regulations/iryo-kiki-qms-kisoku.md");
    const before = readFileSync(seiko, "utf-8");

    const wo = fileRegulationWorkflowWorkOrder("jp_cosmetics_mah", {
      dedupe: false,
      scaffoldDrafts: true,
    });
    expect(wo.draftPaths).toContain(draftRel);
    expect(wo.workOrderId).toBeTruthy();
    expect(readFileSync(seiko, "utf-8")).toBe(before);
  });

  it("updates pending WO content on dedupe", () => {
    const first = fileRegulationWorkflowWorkOrder("jp_cosmetics_mah", {
      dedupe: false,
      scaffoldDrafts: true,
    });
    expect(first.workOrderId).toBeTruthy();
    const second = fileRegulationWorkflowWorkOrder("jp_cosmetics_mah", {
      scaffoldDrafts: true,
    });
    expect(second.deduped).toBe(true);
    expect(second.workOrderId).toBe(first.workOrderId);
    const handoff = loadHandoff(first.workOrderId!);
    expect(handoff.requirements).toContain("Draft output paths");
    expect(handoff.skill).toBe("regulation_module_scaffold");
    expect(handoff.context.path).toContain("drafts/");
  });

  it("dedupes pending regulation workflow work orders", () => {
    const first = fileRegulationWorkflowWorkOrder("jp_tax_corporate", {
      dedupe: false,
      scaffoldDrafts: false,
    });
    expect(first.workOrderId).toBeTruthy();
    expect(first.deduped).not.toBe(true);
    const second = fileRegulationWorkflowWorkOrder("jp_tax_corporate", {
      scaffoldDrafts: false,
    });
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

  it("accepts jp_cosmetics_mah sibling family", () => {
    expect(checkModuleRegulationContract("jp_cosmetics_mah")).toEqual([]);
  });

  it("lists known regulation families", () => {
    expect(listRegulationFamilyIds()).toContain("qms_gxp");
  });

  it("shares risk-module id detection with plan new-hints", () => {
    expect(isRegulationRiskModuleId("jp_tax_corporate")).toBe(true);
    expect(isRegulationRiskModuleId("jp_medical_device")).toBe(true);
    expect(isRegulationRiskModuleId("hospitality")).toBe(false);
  });

  it("flags cash-like manifest with no regulation declarations", () => {
    const issues = checkManifestRegulationContract("jp_tax_synthetic", {
      notes: "skeleton without regs",
    });
    expect(issues.some((i) => i.message.includes("missing required_regulations"))).toBe(true);
  });

  it("flags unknown regulation_family id", () => {
    const issues = checkManifestRegulationContract("jp_tax_synthetic", {
      required_regulations: ["REG-031"],
      regulation_family: { id: "not_a_family", role: "sibling" },
    });
    expect(issues.some((i) => i.message.includes("unknown regulation_family"))).toBe(true);
  });
});
