// @catalog-ids: jp_jsox
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assessRequirementCoverage } from "../src/lib/iso-requirements.js";
import { jsoxEvaluate, jsoxGaps, jsoxStatus } from "../src/lib/jsox.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";

const TENANT = `jp-jsox-${process.pid}`;
const tenantDir = join(getTenantsDir(), TENANT);

beforeAll(() => {
  mkdirSync(join(tenantDir, "data", "org"), { recursive: true });
  mkdirSync(join(tenantDir, "data", "jp-jsox"), { recursive: true });
  mkdirSync(join(tenantDir, "data", "hr"), { recursive: true });
  writeFileSync(
    join(tenantDir, "tenant.yaml"),
    `id: ${TENANT}\nname: jsox fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
    "utf-8",
  );
  writeFileSync(join(tenantDir, "standards.yaml"), "iso: []\n", "utf-8");
  writeFileSync(
    join(tenantDir, "modules.yaml"),
    "modules:\n  - id: jp_jsox\n    agent: jp_jsox\n    enabled: true\n",
    "utf-8",
  );
  writeFileSync(
    join(tenantDir, "data", "hr", "competence.yaml"),
    `version: "1"\nas_of: 2026-08-01\nroles: []\ncompetences:\n  - id: CMP-10\n    title: 内部監査員\n    required: {}\nassessments:\n  - employee_id: EMP-001\n    competence_id: CMP-10\n    level: 3\n    assessed_on: 2026-04-01\n    basis: 研修\n`,
    "utf-8",
  );
  writeFileSync(
    join(tenantDir, "data", "jp-jsox", "scope.yaml"),
    `version: "1"\nareas:\n  - id: entity\n    title: 全社的内部統制\n    in_scope: true\n`,
    "utf-8",
  );
  writeFileSync(
    join(tenantDir, "data", "jp-jsox", "processes.yaml"),
    `version: "1"\nprocesses:\n  - id: sales\n    title: 販売\n    module: sales\n`,
    "utf-8",
  );
  writeFileSync(
    join(tenantDir, "data", "jp-jsox", "itgc.yaml"),
    `version: "1"\nchecks:\n  - id: ITGC-access\n    title: アクセス管理\n`,
    "utf-8",
  );
  setTenantId(TENANT);
});

beforeEach(() => {
  setTenantId(TENANT);
});

afterAll(() => {
  rmSync(tenantDir, { recursive: true, force: true });
  clearOperatorsRegistryCacheForTests();
});

describe("jp_jsox", () => {
  it("covers entity, close, process and ITGC without dangling controls", () => {
    const coverage = assessRequirementCoverage("jsox");
    expect(coverage.requirements.length).toBe(4);
    expect(coverage.uncovered).toEqual([]);
    expect(coverage.orphan_controls).toEqual([]);
    expect(coverage.dangling).toEqual([]);
  });

  it("reports seeded scope as present", () => {
    const status = jsoxStatus();
    expect(status.scope_areas).toBe(1);
    expect(status.processes).toBe(1);
    expect(status.itgc_checks).toBe(1);
    expect(jsoxGaps().some((g) => g.includes("評価範囲"))).toBe(false);
  });

  it("refuses finance self-evaluation", () => {
    writeFileSync(
      join(tenantDir, "data", "org", "operators.yaml"),
      `version: "1"\noperators:\n  - operator_id: OP-FIN\n    display_name: 経理\n    role: operator\n    status: active\n    allowed_agents: [finance]\n`,
      "utf-8",
    );
    clearOperatorsRegistryCacheForTests();
    const result = jsoxEvaluate("OP-FIN");
    expect(result.ok).toBe(false);
    expect(result.refused).toMatch(/finance/);
  });
});
