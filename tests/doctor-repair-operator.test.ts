import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import YAML from "yaml";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { getMailConfigPath } from "../src/lib/correspondence/paths.js";
import {
  clearOperatorsRegistryCacheForTests,
  hashOperatorKey,
  loadOperatorRegistry,
  saveOperatorRegistry,
  verifyOperatorKey,
} from "../src/lib/org/operators.js";
import { readOperatorKeyFromFile } from "../src/lib/console-auth/cli-operator.js";
import { collectOperationalReadinessIssues } from "../src/lib/scheduling-coordination/operational-readiness.js";
import { rotateOperatorKeyRecord } from "../src/lib/org/operator-keys.js";

describe("doctor repair operator keys", () => {
  const tenantId = "test-doctor-repair-op";
  const keyPath = join(homedir(), ".orgos", "operators", "OP-001.key");
  let keyBackup: string | undefined;

  beforeEach(() => {
    clearOperatorsRegistryCacheForTests();
    const root = join(getTenantsDir(), tenantId);
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(root, "data", "executive"), { recursive: true });
    mkdirSync(join(root, "data", "org"), { recursive: true });
    writeFileSync(join(root, "tenant.yaml"), `id: ${tenantId}\nname: Repair Test\n`, "utf-8");
    setTenantId(tenantId);
    writeFileSync(
      join(getDataDir(), "company.yaml"),
      YAML.stringify({
        name: "Repair Test",
        public_disclosure: { representative_email: "ceo@repair.test" },
      }),
      "utf-8"
    );
    for (const file of [
      ["scheduling-cases.yaml", "version: 1\ncases: []\n"],
      ["calendar.yaml", "events: []\n"],
      ["ceo-inline-questions.yaml", "version: 1\nquestions: []\n"],
    ] as const) {
      writeFileSync(join(getDataDir(), "executive", file[0]), file[1], "utf-8");
    }
    if (existsSync(keyPath)) keyBackup = readFileSync(keyPath, "utf-8");
    saveOperatorRegistry({
      version: "1",
      operators: [
        {
          operator_id: "OP-001",
          display_name: "CEO",
          role: "ceo",
          status: "active",
          approver_name: "CEO",
          key_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        },
      ],
    });
    rotateOperatorKeyRecord("OP-001");
  });

  afterEach(() => {
    clearOperatorsRegistryCacheForTests();
    rmSync(join(getTenantsDir(), tenantId), { recursive: true, force: true });
    const mail = getMailConfigPath();
    if (existsSync(mail)) rmSync(mail);
    if (keyBackup !== undefined) {
      writeFileSync(keyPath, keyBackup, { mode: 0o600 });
    }
  });

  it("syncs key_hash when local key file matches after repair", () => {
    const key = readOperatorKeyFromFile("OP-001")!;
    saveOperatorRegistry({
      version: "1",
      operators: [
        {
          operator_id: "OP-001",
          display_name: "CEO",
          role: "ceo",
          status: "active",
          approver_name: "CEO",
          key_hash: hashOperatorKey("stale-hash-value"),
        },
      ],
    });

    const report = collectOperationalReadinessIssues({
      syncOperatorKeys: true,
      repairOperatorKeys: true,
      ensureMailConfig: true,
    });

    expect(report.synced_operators).toContain("OP-001");
    const op = loadOperatorRegistry()!.operators[0]!;
    expect(verifyOperatorKey(op.key_hash, key)).toBe(true);
    expect(report.issues.some((i) => i.id === "operator_key_mismatch_OP-001")).toBe(false);
  });

  it("rotates when local key file is missing", () => {
    const missingPath = join(homedir(), ".orgos", "operators", "OP-099.key");
    saveOperatorRegistry({
      version: "1",
      operators: [
        {
          operator_id: "OP-099",
          display_name: "Approver",
          role: "approver",
          status: "active",
          approver_name: "Approver",
          key_hash: hashOperatorKey("orphan"),
        },
      ],
    });
    if (existsSync(missingPath)) rmSync(missingPath);

    const report = collectOperationalReadinessIssues({
      syncOperatorKeys: true,
      repairOperatorKeys: true,
    });

    expect(report.rotated_operators).toContain("OP-099");
    expect(existsSync(missingPath)).toBe(true);
    rmSync(missingPath, { force: true });
  });
});
