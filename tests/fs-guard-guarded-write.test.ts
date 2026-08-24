import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { monthlyFinanceSchema } from "../schemas/index.js";
import { runFinancesAdd } from "../src/commands/finances.js";
import {
  currentCanonicalSha256,
  ensureIssuer,
  issueGrant,
  keygenAgent,
  setFsGuardPathsForTests,
  type FsGuardPaths,
} from "../src/lib/org/fs-guard/index.js";
import { writeTenantContentGuarded } from "../src/lib/org/fs-guard/guarded-write.js";
import { setTenantId, tenantDataPath } from "../src/lib/tenant.js";
import YAML from "yaml";
import {
  makeFsGuardPathsForTests,
  removeFsGuardPathsForTests,
} from "./helpers/fs-guard-store-fixture.js";

describe("fs-guard guarded-write integration", () => {
  let store: FsGuardPaths;
  let prevGuard: string | undefined;

  beforeEach(() => {
    setTenantId("demo");
    store = makeFsGuardPathsForTests("orgos-fs-guard-enforce-");
    setFsGuardPathsForTests(store);
    prevGuard = process.env.ORGOS_FS_GUARD;
    process.env.ORGOS_FS_GUARD = "enforce";
    ensureIssuer(store);
    keygenAgent("finance", { paths: store });
    issueGrant({
      agentId: "finance",
      op: "write",
      pathPattern: "data/finance/**",
      issuedBy: "test",
      paths: store,
    });
  });

  afterEach(() => {
    setFsGuardPathsForTests(undefined);
    if (prevGuard === undefined) delete process.env.ORGOS_FS_GUARD;
    else process.env.ORGOS_FS_GUARD = prevGuard;
    removeFsGuardPathsForTests(store);
  });

  it("writeTenantContentGuarded persists finance YAML when enforce is on", () => {
    const logicalPath = "data/finance/monthly/2026-08.yaml";
    const entry = monthlyFinanceSchema.parse({
      month: "2026-08",
      revenue: [{ category: "other_revenue", amount: 1000 }],
      expenses: [{ category: "other", amount: 500 }],
    });
    const yamlBody = YAML.stringify(entry);

    const result = writeTenantContentGuarded({
      agentId: "finance",
      logicalPath,
      content: yamlBody,
      runId: "TEST-fs-guard-finances",
      expectedSha256: currentCanonicalSha256(logicalPath),
    });
    expect(result).toBe(logicalPath);

    const abs = tenantDataPath("finance", "monthly", "2026-08.yaml");
    expect(existsSync(abs)).toBe(true);
    const parsed = YAML.parse(readFileSync(abs, "utf-8"));
    expect(parsed.month).toBe("2026-08");
    unlinkSync(abs);
  });

  it("rejects writeTenantContentGuarded without CAS when enforce is on", () => {
    expect(() =>
      writeTenantContentGuarded({
        agentId: "finance",
        logicalPath: "data/finance/monthly/2026-08.yaml",
        content: "x\n",
      })
    ).toThrow(/CAS expected_sha256 is required/);
  });

  it("runFinancesAdd uses guarded write when enforce is on", () => {
    process.env.ORGOS_OPERATOR_KEY = "demo-operator-key";
    const tmpFile = join(tmpdir(), `finances-add-${process.pid}.yaml`);
    const entry = {
      month: "2026-09",
      revenue: [{ category: "other_revenue", amount: 2000 }],
      expenses: [{ category: "other", amount: 800 }],
    };
    writeFileSync(tmpFile, YAML.stringify(entry), "utf-8");
    try {
      runFinancesAdd({ month: "2026-09", file: tmpFile });
      const abs = tenantDataPath("finance", "monthly", "2026-09.yaml");
      expect(existsSync(abs)).toBe(true);
      unlinkSync(abs);
    } finally {
      unlinkSync(tmpFile);
      delete process.env.ORGOS_OPERATOR_KEY;
    }
  });
});
