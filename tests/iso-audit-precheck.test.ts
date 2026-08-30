import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyPrecheckFindings, buildAuditBrief, formatFollowUp, proposePrecheckFindings } from "../src/lib/iso-audit-precheck.js";
import { createAuditPlan, findAuditPlan, saveAuditPlans, setAuditFinding } from "../src/lib/iso-audit-plan.js";
import { loadRequirements } from "../src/lib/iso-requirements.js";
import { getSkillById } from "../src/lib/skill-registry.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";

const TENANT = `iso-precheck-${process.pid}`;
const tenantDir = join(getTenantsDir(), TENANT);
const AUDITOR = "OP-AUD-001";

function writeOperators(): void {
  mkdirSync(join(tenantDir, "data", "org"), { recursive: true });
  writeFileSync(
    join(tenantDir, "data", "org", "operators.yaml"),
    `version: "1"\noperators:\n` +
      `  - operator_id: OP-CEO-001\n    display_name: 代表\n    role: ceo\n    status: active\n` +
      `  - operator_id: ${AUDITOR}\n    display_name: 内部監査員\n    role: auditor\n` +
      `    status: active\n    person_id: EMP-001\n` +
      `    allowed_agents: [internal_audit]\n`,
    "utf-8",
  );
  clearOperatorsRegistryCacheForTests();
}

beforeAll(() => {
  mkdirSync(join(tenantDir, "data", "compliance"), { recursive: true });
  writeFileSync(
    join(tenantDir, "tenant.yaml"),
    `id: ${TENANT}\nname: precheck fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
    "utf-8",
  );
  writeFileSync(join(tenantDir, "standards.yaml"), `iso:\n  - id: ISO-21401\n    enabled: true\n`, "utf-8");
  writeFileSync(
    join(tenantDir, "modules.yaml"),
    "modules:\n  - id: hospitality\n    agent: hospitality\n    enabled: false\n",
    "utf-8",
  );
  mkdirSync(join(tenantDir, "data", "hr"), { recursive: true });
  writeFileSync(
    join(tenantDir, "data", "hr", "competence.yaml"),
    `version: "1"\nas_of: 2026-08-01\nroles: []\ncompetences:\n  - id: CMP-10\n    title: 内部監査員\n    required: {}\nassessments:\n  - employee_id: EMP-001\n    competence_id: CMP-10\n    level: 3\n    assessed_on: 2026-04-01\n    basis: 研修\n`,
    "utf-8",
  );
  setTenantId(TENANT);
});

beforeEach(() => {
  setTenantId(TENANT);
  writeOperators();
  saveAuditPlans({ plans: [] });
});

afterAll(() => {
  rmSync(tenantDir, { recursive: true, force: true });
  clearOperatorsRegistryCacheForTests();
});

describe("apply-precheck", () => {
  it("never proposes major or not_applicable", () => {
    const plan = createAuditPlan({
      standard: "ISO-21401",
      auditorOperatorId: AUDITOR,
      periodStart: "2026-09",
      periodEnd: "2027-08",
      createdBy: AUDITOR,
    });
    const proposals = proposePrecheckFindings(plan.plan_id);
    expect(proposals.every((p) => p.skipped || p.verdict === "conform" || p.verdict === "nonconform_minor")).toBe(
      true,
    );
  });

  it("writes proposed findings with a sample", () => {
    const plan = createAuditPlan({
      standard: "ISO-21401",
      auditorOperatorId: AUDITOR,
      periodStart: "2026-09",
      periodEnd: "2027-08",
      createdBy: AUDITOR,
    });
    applyPrecheckFindings(plan.plan_id, AUDITOR);
    const stored = findAuditPlan(plan.plan_id)!;
    expect(stored.findings.length).toBeGreaterThan(0);
    expect(stored.findings.every((f) => (f.sample ?? "").length > 0)).toBe(true);
    expect(stored.findings.every((f) => f.verdict !== "nonconform_major" && f.verdict !== "not_applicable")).toBe(
      true,
    );
  });

  it("does not overwrite a human finding", () => {
    const plan = createAuditPlan({
      standard: "ISO-21401",
      auditorOperatorId: AUDITOR,
      periodStart: "2026-09",
      periodEnd: "2027-08",
      createdBy: AUDITOR,
    });
    const req = loadRequirements("ISO-21401")!.requirements[0]!.id;
    setAuditFinding({
      planId: plan.plan_id,
      requirementId: req,
      verdict: "not_applicable",
      sample: "適用範囲外と確認",
      note: "対象施設に該当しない",
      recordedBy: AUDITOR,
    });
    applyPrecheckFindings(plan.plan_id, AUDITOR);
    expect(findAuditPlan(plan.plan_id)!.findings.find((f) => f.requirement_id === req)?.verdict).toBe(
      "not_applicable",
    );
  });
});

describe("brief skill", () => {
  it("is a read skill and does not mention writing a verdict", () => {
    const skill = getSkillById("iso_audit_brief");
    expect(skill?.chat?.kind).toBe("read");
    const plan = createAuditPlan({
      standard: "ISO-21401",
      auditorOperatorId: AUDITOR,
      periodStart: "2026-09",
      periodEnd: "2027-08",
      createdBy: AUDITOR,
    });
    const req = loadRequirements("ISO-21401")!.requirements[0]!.id;
    const brief = buildAuditBrief(plan.plan_id, req);
    expect(brief).toContain("言い換え");
    expect(brief).toContain("判定は `orgos iso audit finding set`");
  });
});

describe("follow-up", () => {
  it("lists open nonconformities from the plan", () => {
    const plan = createAuditPlan({
      standard: "ISO-21401",
      auditorOperatorId: AUDITOR,
      periodStart: "2026-09",
      periodEnd: "2027-08",
      createdBy: AUDITOR,
    });
    applyPrecheckFindings(plan.plan_id, AUDITOR);
    const text = formatFollowUp(plan.plan_id);
    expect(text).toContain("フォローアップ");
  });
});
