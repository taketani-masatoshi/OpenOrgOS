import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  clearOperatorsRegistryCacheForTests,
  hashOperatorKey,
  loadOperatorRegistry,
  saveOperatorRegistry,
  verifyOperatorKey,
} from "../src/lib/org/operators.js";

const root = join(import.meta.dirname, "..");
const tenantId = "test-operator-registry-cli";

function runOrgos(args: string[], env: Record<string, string> = {}): ReturnType<typeof spawnSync> {
  return spawnSync("npm", ["run", "orgos", "--", ...args], {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, ORGOS_SUPPRESS_LEGACY_WARN: "1", ...env },
  });
}

describe("operator registry CLI", () => {
  const op001KeyPath = join(homedir(), ".orgos", "operators", "OP-001.key");
  const op002KeyPath = join(homedir(), ".orgos", "operators", "OP-002.key");
  let op001Backup: string | undefined;
  let op002Backup: string | undefined;

  beforeEach(() => {
    clearOperatorsRegistryCacheForTests();
    const tenantRoot = join(getTenantsDir(), tenantId);
    rmSync(tenantRoot, { recursive: true, force: true });
    mkdirSync(join(tenantRoot, "data", "org"), { recursive: true });
    writeFileSync(join(tenantRoot, "tenant.yaml"), `id: ${tenantId}\nname: Op CLI Test\n`, "utf-8");
    setTenantId(tenantId);
    writeFileSync(
      join(getDataDir(), "company.yaml"),
      YAML.stringify({
        name: "Op CLI Test",
        public_disclosure: { representative_email: "ceo@op-cli.test" },
      }),
      "utf-8"
    );
    saveOperatorRegistry({
      version: "1",
      operators: [
        {
          operator_id: "OP-001",
          display_name: "CEO",
          role: "ceo",
          status: "active",
          approver_name: "CEO",
          key_hash: hashOperatorKey("seed-op-001"),
        },
        {
          operator_id: "OP-002",
          display_name: "Operator",
          role: "operator",
          status: "active",
          key_hash: hashOperatorKey("seed-op-002"),
        },
      ],
    });
    if (existsSync(op001KeyPath)) op001Backup = readFileSync(op001KeyPath, "utf-8");
    if (existsSync(op002KeyPath)) op002Backup = readFileSync(op002KeyPath, "utf-8");
    writeFileSync(op001KeyPath, "seed-op-001\n", { mode: 0o600 });
    writeFileSync(op002KeyPath, "seed-op-002\n", { mode: 0o600 });
  });

  afterEach(() => {
    clearOperatorsRegistryCacheForTests();
    rmSync(join(getTenantsDir(), tenantId), { recursive: true, force: true });
    if (op001Backup !== undefined) writeFileSync(op001KeyPath, op001Backup, { mode: 0o600 });
    else if (existsSync(op001KeyPath)) rmSync(op001KeyPath);
    if (op002Backup !== undefined) writeFileSync(op002KeyPath, op002Backup, { mode: 0o600 });
    else if (existsSync(op002KeyPath)) rmSync(op002KeyPath);
  });

  it("rotate-key --id targets subcommand id even when global --operator-id is set", () => {
    const before = loadOperatorRegistry()!.operators.find((o) => o.operator_id === "OP-001")!.key_hash;
    const result = runOrgos([
      "--operator-id",
      "OP-002",
      "--tenant",
      tenantId,
      "operator",
      "registry",
      "rotate-key",
      "--id",
      "OP-001",
    ]);
    expect(result.status, `${result.stderr}${result.stdout}`).toBe(0);
    expect(result.stdout).toContain("Rotated key for OP-001");

    clearOperatorsRegistryCacheForTests();
    const op001 = loadOperatorRegistry()!.operators.find((o) => o.operator_id === "OP-001")!;
    const op002 = loadOperatorRegistry()!.operators.find((o) => o.operator_id === "OP-002")!;
    expect(op001.key_hash).not.toBe(before);
    expect(op002.key_hash).toBe(hashOperatorKey("seed-op-002"));

    const newKey = readFileSync(op001KeyPath, "utf-8").trim();
    expect(verifyOperatorKey(op001.key_hash, newKey)).toBe(true);
    expect(newKey).not.toBe("seed-op-001");
  });
});
