/**
 * Distributing blank forms must never clobber a tenant's records, and must not
 * silently turn a control conforming just because a file now exists.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyIsoTemplateSync,
  planIsoTemplateSync,
  tenantEvidenceRel,
} from "../src/lib/iso-templates.js";
import { describeMissingEvidence, hasEvidenceForControl } from "../src/lib/control-framework.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";

const TENANT = `iso-templates-${process.pid}`;
const tenantDir = join(getTenantsDir(), TENANT);
const evidenceDir = join(tenantDir, tenantEvidenceRel("ISO-21401"));

beforeAll(() => {
  mkdirSync(tenantDir, { recursive: true });
  writeFileSync(
    join(tenantDir, "tenant.yaml"),
    `id: ${TENANT}\nname: ISO templates fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
    "utf-8",
  );
  setTenantId(TENANT);
});

beforeEach(() => {
  rmSync(evidenceDir, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(tenantDir, { recursive: true, force: true });
});

describe("iso templates", () => {
  it("plans every pack form as a creation for an empty tenant", () => {
    const plan = planIsoTemplateSync("ISO-21401");
    expect(plan.rows.length).toBeGreaterThan(0);
    expect(plan.rows.every((r) => r.action === "create")).toBe(true);
    expect(plan.evidence_forms).toBe("complete");
  });

  it("writes the forms and then reports them as existing", () => {
    applyIsoTemplateSync(planIsoTemplateSync("ISO-21401"));
    const second = planIsoTemplateSync("ISO-21401");
    expect(second.rows.every((r) => r.action === "keep")).toBe(true);
  });

  it("never overwrites a form the tenant has filled in", () => {
    const plan = planIsoTemplateSync("ISO-21401");
    const target = plan.rows.find((r) => r.file === "kpi-log.csv");
    expect(target).toBeDefined();
    const filled = "month,occupancy_nights\n2026-04,120\n";
    mkdirSync(dirname(target!.target), { recursive: true });
    writeFileSync(target!.target, filled, "utf-8");

    applyIsoTemplateSync(planIsoTemplateSync("ISO-21401"));
    expect(readFileSync(target!.target, "utf-8")).toBe(filled);
  });

  it("refuses a standard that has no pack yet", () => {
    expect(() => planIsoTemplateSync("ISO-56001")).toThrow(/scaffold/);
  });

  it("refuses an id that is not in the catalog", () => {
    expect(() => planIsoTemplateSync("ISO-00000")).toThrow(/catalog/);
  });

  it("a distributed blank form does not count as evidence", () => {
    applyIsoTemplateSync(planIsoTemplateSync("ISO-21401"));
    const ctrl = {
      evidence_paths: [`${tenantEvidenceRel("ISO-21401")}/environmental-aspects.csv`],
      evidence_mode: "any",
    } as Parameters<typeof hasEvidenceForControl>[0];

    expect(hasEvidenceForControl(ctrl)).toBe(false);
    expect(describeMissingEvidence(ctrl)[0]).toContain("未記入");
  });

  it("counts the form once it carries a record", () => {
    applyIsoTemplateSync(planIsoTemplateSync("ISO-21401"));
    const rel = `${tenantEvidenceRel("ISO-21401")}/environmental-aspects.csv`;
    const file = join(tenantDir, rel);
    writeFileSync(file, `${readFileSync(file, "utf-8").trimEnd()}\nASP-01,清掃,洗剤排水,水質,運用,normal,3,3,9,yes,希釈管理,2026-09\n`, "utf-8");

    const ctrl = { evidence_paths: [rel], evidence_mode: "any" } as Parameters<
      typeof hasEvidenceForControl
    >[0];
    expect(hasEvidenceForControl(ctrl)).toBe(true);
  });

  it("treats a Markdown form with unreplaced placeholders as unfilled", () => {
    applyIsoTemplateSync(planIsoTemplateSync("ISO-21401"));
    const rel = `${tenantEvidenceRel("ISO-21401")}/worker-welfare.md`;
    const ctrl = { evidence_paths: [rel], evidence_mode: "any" } as Parameters<
      typeof hasEvidenceForControl
    >[0];
    expect(hasEvidenceForControl(ctrl)).toBe(false);
  });
});
