/**
 * The audit workflow exists to stop a conclusion being drawn over requirements
 * nobody looked at, and to stop an auditor judging their own work. Both are
 * refusals, so both are pinned here.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assessAuditorEligibility,
  assessProgrammeCoverage,
  auditPlanDigest,
  auditPlanProgress,
  auditSignoffValid,
  concludeAuditPlan,
  createAuditPlan,
  findAuditPlan,
  formatAuditPlan,
  loadAuditPlans,
  recordAuditSignoff,
  saveAuditPlans,
  setAuditFinding,
} from "../src/lib/iso-audit-plan.js";
import { loadRequirements } from "../src/lib/iso-requirements.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";

const TENANT = `iso-audit-plan-${process.pid}`;
const tenantDir = join(getTenantsDir(), TENANT);
const REQUIREMENTS = loadRequirements("ISO-21401")!.requirements;

const AUDITOR = "OP-AUD-001";
const APPROVER = "OP-CEO-001";

function writeOperators(auditorAgents: string[]): void {
  mkdirSync(join(tenantDir, "data", "org"), { recursive: true });
  writeFileSync(
    join(tenantDir, "data", "org", "operators.yaml"),
    `version: "1"\noperators:\n` +
      `  - operator_id: ${APPROVER}\n    display_name: 代表\n    role: ceo\n    status: active\n` +
      `  - operator_id: ${AUDITOR}\n    display_name: 内部監査員\n    role: auditor\n` +
      `    status: active\n    person_id: EMP-001\n` +
      `    allowed_agents: [${auditorAgents.join(", ")}]\n`,
    "utf-8",
  );
  clearOperatorsRegistryCacheForTests();
}

function writeCompetence(withAuditorCompetence: boolean): void {
  mkdirSync(join(tenantDir, "data", "hr"), { recursive: true });
  const competences = withAuditorCompetence
    ? `  - id: CMP-10\n    title: 内部監査員\n    required: {}\n`
    : `  - id: CMP-01\n    title: 別の力量\n    required: {}\n`;
  const assessments = withAuditorCompetence
    ? `  - employee_id: EMP-001\n    competence_id: CMP-10\n    level: 3\n` +
      `    assessed_on: 2026-04-01\n    basis: 内部監査員研修修了\n`
    : "";
  writeFileSync(
    join(tenantDir, "data", "hr", "competence.yaml"),
    `version: "1"\nas_of: 2026-08-01\nroles: []\ncompetences:\n${competences}` +
      (assessments ? `assessments:\n${assessments}` : "assessments: []\n"),
    "utf-8",
  );
}

function newPlan(overrides: Partial<Parameters<typeof createAuditPlan>[0]> = {}) {
  return createAuditPlan({
    standard: "ISO-21401",
    auditorOperatorId: AUDITOR,
    periodStart: "2026-09",
    periodEnd: "2027-08",
    createdBy: AUDITOR,
    ...overrides,
  });
}

function judgeAll(planId: string, verdict: "conform" | "nonconform_minor" = "conform"): void {
  for (const req of REQUIREMENTS) {
    setAuditFinding({
      planId,
      requirementId: req.id,
      verdict,
      sample: "関連記録をサンプリングした",
      note: verdict === "conform" ? undefined : "根拠となる記録がない",
      recordedBy: AUDITOR,
    });
  }
}

beforeAll(() => {
  mkdirSync(join(tenantDir, "data", "compliance"), { recursive: true });
  writeFileSync(
    join(tenantDir, "tenant.yaml"),
    `id: ${TENANT}\nname: ISO audit plan fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
    "utf-8",
  );
  writeFileSync(
    join(tenantDir, "standards.yaml"),
    `version: "1"\niso:\n  - id: ISO-21401\n    enabled: true\n`,
    "utf-8",
  );
  writeFileSync(
    join(tenantDir, "modules.yaml"),
    "modules:\n  - id: hospitality\n    agent: hospitality\n    enabled: false\n",
    "utf-8",
  );
  setTenantId(TENANT);
});

beforeEach(() => {
  setTenantId(TENANT);
  writeOperators(["internal_audit"]);
  writeCompetence(true);
  saveAuditPlans({ plans: [] });
});

afterAll(() => {
  rmSync(tenantDir, { recursive: true, force: true });
  clearOperatorsRegistryCacheForTests();
});

describe("auditor eligibility", () => {
  it("accepts an auditor with no overlap and an assessed competence", () => {
    const result = assessAuditorEligibility(AUDITOR, "ISO-21401", []);
    expect(result.eligible).toBe(true);
    expect(result.conflicting_agents).toEqual([]);
  });

  it("refuses an auditor authorised to operate an agent that owns a control under audit", () => {
    writeOperators(["operations"]);
    const result = assessAuditorEligibility(AUDITOR, "ISO-21401", []);
    expect(result.eligible).toBe(false);
    expect(result.conflicting_agents).toContain("operations");
    expect(() => newPlan()).toThrow(/独立性|重複/);
  });

  it("refuses an auditor whose competence has not been assessed", () => {
    writeCompetence(false);
    const result = assessAuditorEligibility(AUDITOR, "ISO-21401", []);
    expect(result.eligible).toBe(false);
    expect(result.competence_issue).toContain("CMP-10");
    expect(() => newPlan()).toThrow(/力量|内部監査員/);
  });

  it("records the plan under --force, so an override is visible rather than silent", () => {
    writeOperators(["operations"]);
    const plan = newPlan({ overrideEligibility: true });
    expect(findAuditPlan(plan.plan_id)?.status).toBe("draft");
  });
});

describe("audit plan lifecycle", () => {
  it("creates a plan against the requirement register", () => {
    const plan = newPlan({ sampling: "各記録から3件抽出" });
    expect(plan.plan_id).toBe("IAP-001");
    expect(auditPlanProgress(plan).total).toBe(REQUIREMENTS.length);
    expect(auditPlanProgress(plan).judged).toBe(0);
  });

  it("refuses a period that runs backwards", () => {
    expect(() => newPlan({ periodStart: "2027-08", periodEnd: "2026-09" })).toThrow(/期間/);
  });

  it("creates a plan once the register is filled", () => {
    const plan = newPlan({ standard: "ISO-37000" });
    expect(plan.standard).toBe("ISO-37000");
    expect(auditPlanProgress(plan).total).toBeGreaterThan(0);
  });

  it("demands sampling even for a conforming finding", () => {
    const plan = newPlan();
    expect(() =>
      setAuditFinding({
        planId: plan.plan_id,
        requirementId: REQUIREMENTS[0].id,
        verdict: "conform",
        recordedBy: AUDITOR,
      }),
    ).toThrow(/サンプリング/);
  });

  it("refuses a finding against a requirement the standard does not have", () => {
    const plan = newPlan();
    expect(() =>
      setAuditFinding({
        planId: plan.plan_id,
        requirementId: "REQ-NOPE",
        verdict: "conform",
        recordedBy: AUDITOR,
      }),
    ).toThrow(/REQ-NOPE/);
  });

  it("demands the auditor's own words for a nonconformity", () => {
    const plan = newPlan();
    expect(() =>
      setAuditFinding({
        planId: plan.plan_id,
        requirementId: REQUIREMENTS[0].id,
        verdict: "nonconform_major",
        recordedBy: AUDITOR,
      }),
    ).toThrow(/記述/);
  });

  it("replaces rather than duplicates a revised finding", () => {
    const plan = newPlan();
    const req = REQUIREMENTS[0].id;
    setAuditFinding({ planId: plan.plan_id, requirementId: req, verdict: "conform", sample: "3件", recordedBy: AUDITOR });
    setAuditFinding({
      planId: plan.plan_id,
      requirementId: req,
      verdict: "observation",
      sample: "3件",
      recordedBy: AUDITOR,
    });
    const stored = findAuditPlan(plan.plan_id)!;
    expect(stored.findings).toHaveLength(1);
    expect(stored.findings[0].verdict).toBe("observation");
  });

  it("refuses to conclude while any requirement is unjudged", () => {
    const plan = newPlan();
    setAuditFinding({
      planId: plan.plan_id,
      requirementId: REQUIREMENTS[0].id,
      verdict: "conform",
      sample: "3件",
      recordedBy: AUDITOR,
    });
    expect(() =>
      concludeAuditPlan(plan.plan_id, { concludedBy: AUDITOR, summary: "問題なし" }),
    ).toThrow(/未判定/);
    expect(findAuditPlan(plan.plan_id)?.status).toBe("draft");
  });

  it("concludes once every requirement has a verdict, counting nonconformities", () => {
    const plan = newPlan();
    judgeAll(plan.plan_id, "nonconform_minor");
    const concluded = concludeAuditPlan(plan.plan_id, {
      concludedBy: AUDITOR,
      summary: "運用開始前のため記録が未整備",
    });
    expect(concluded.status).toBe("concluded");
    expect(concluded.conclusion?.nonconformities).toBe(REQUIREMENTS.length);
  });

  it("reopens a concluded plan when a finding is revised", () => {
    const plan = newPlan();
    judgeAll(plan.plan_id);
    concludeAuditPlan(plan.plan_id, { concludedBy: AUDITOR, summary: "適合" });
    setAuditFinding({
      planId: plan.plan_id,
      requirementId: REQUIREMENTS[0].id,
      verdict: "observation",
      sample: "3件",
      recordedBy: AUDITOR,
    });
    const stored = findAuditPlan(plan.plan_id)!;
    expect(stored.status).toBe("draft");
    expect(stored.conclusion).toBeUndefined();
  });
});

describe("sign-off", () => {
  it("refuses to sign a plan that has not been concluded", () => {
    const plan = newPlan();
    expect(() =>
      recordAuditSignoff(plan.plan_id, { approvalId: "APR-20260901-001", operatorId: APPROVER }),
    ).toThrow(/conclude/);
  });

  it("refuses self-approval by the auditor", () => {
    const plan = newPlan();
    judgeAll(plan.plan_id);
    concludeAuditPlan(plan.plan_id, { concludedBy: AUDITOR, summary: "適合" });
    expect(() =>
      recordAuditSignoff(plan.plan_id, { approvalId: "APR-20260901-001", operatorId: AUDITOR }),
    ).toThrow(/自ら/);
  });

  it("stops verifying when a finding is edited after signing", () => {
    const plan = newPlan();
    judgeAll(plan.plan_id);
    concludeAuditPlan(plan.plan_id, { concludedBy: AUDITOR, summary: "適合" });
    const signed = recordAuditSignoff(plan.plan_id, {
      approvalId: "APR-20260901-001",
      operatorId: APPROVER,
    });
    expect(auditSignoffValid(signed)).toBe(true);

    // Tamper directly, bypassing setAuditFinding's refusal on a signed plan.
    const registry = loadAuditPlans();
    registry.plans[0].findings[0].verdict = "nonconform_major";
    saveAuditPlans(registry);

    const tampered = findAuditPlan(plan.plan_id)!;
    expect(auditSignoffValid(tampered)).toBe(false);
    expect(formatAuditPlan(tampered)).toContain("署名後に所見が変更されています");
  });

  it("refuses to change a finding on a signed plan", () => {
    const plan = newPlan();
    judgeAll(plan.plan_id);
    concludeAuditPlan(plan.plan_id, { concludedBy: AUDITOR, summary: "適合" });
    recordAuditSignoff(plan.plan_id, { approvalId: "APR-20260901-001", operatorId: APPROVER });
    expect(() =>
      setAuditFinding({
        planId: plan.plan_id,
        requirementId: REQUIREMENTS[0].id,
        verdict: "observation",
        recordedBy: AUDITOR,
      }),
    ).toThrow(/署名済み/);
  });

  it("changes the digest when the judgements change", () => {
    const plan = newPlan();
    const before = auditPlanDigest(plan);
    judgeAll(plan.plan_id);
    expect(auditPlanDigest(findAuditPlan(plan.plan_id)!)).not.toBe(before);
  });
});

describe("audit programme", () => {
  it("names requirements never audited in the window", () => {
    const plan = newPlan();
    judgeAll(plan.plan_id);
    concludeAuditPlan(plan.plan_id, { concludedBy: AUDITOR, summary: "適合" });
    const coverage = assessProgrammeCoverage("ISO-21401", "2000-01-01T00:00:00.000Z");
    expect(coverage.never_audited).toEqual([]);

    // A window that starts after the audit leaves everything uncovered.
    const future = assessProgrammeCoverage("ISO-21401", "2099-01-01T00:00:00.000Z");
    expect(future.never_audited.length).toBe(REQUIREMENTS.length);
  });

  it("ignores draft plans, which record no completed judgement round", () => {
    const plan = newPlan();
    judgeAll(plan.plan_id);
    const coverage = assessProgrammeCoverage("ISO-21401", "2000-01-01T00:00:00.000Z");
    expect(coverage.never_audited.length).toBe(REQUIREMENTS.length);
  });
});

describe("report", () => {
  it("states that the requirement wording is unverified", () => {
    const plan = newPlan();
    expect(formatAuditPlan(plan)).toContain("言い換え");
  });
});

describe("framework", () => {
  it("creates a financial assertion plan with accounting criteria", () => {
    const plan = newPlan({ standard: "financial", framework: "financial" });
    expect(plan.framework).toBe("financial");
    expect(plan.criteria.join()).toMatch(/会計方針/);
    expect(auditPlanProgress(plan).total).toBe(5);
  });

  it("creates a jsox plan", () => {
    const plan = newPlan({ standard: "jsox", framework: "jsox" });
    expect(plan.framework).toBe("jsox");
    expect(auditPlanProgress(plan).total).toBe(4);
  });
});
