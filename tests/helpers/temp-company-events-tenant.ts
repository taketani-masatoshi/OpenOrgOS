import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";
import { setCliOperatorContext } from "../../src/lib/console-auth/cli-operator.js";
import { initCompanyEventsFile } from "../../src/lib/company-events.js";
import { refreshOrgOsPaths, getWorkspaceRoot } from "../../src/lib/orgos-paths.js";
import { clearAccessGrantsCacheForTests } from "../../src/lib/org/access-grants.js";
import {
  clearOperatorsRegistryCacheForTests,
  hashOperatorKey,
} from "../../src/lib/org/operators.js";
import { setTenantId } from "../../src/lib/tenant.js";

export const HA_ISO_TENANT_ID = "ha-iso";
export const HA_CEO_ID = "OP-CEO";
export const HA_CEO_KEY = "ha-ceo-key";
export const HA_RO_ID = "OP-RO";
export const HA_RO_KEY = "ha-ro-key";
export const HA_OP_ID = "OP-OPR";
export const HA_OP_KEY = "ha-opr-key";

const ORIGINAL_WORKSPACE = getWorkspaceRoot();

export type MalEventsFingerprint = {
  registry: string | null;
  chain: string | null;
};

function fingerprint(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function malCompanyEventsFingerprints(): MalEventsFingerprint {
  return {
    registry: fingerprint(join(ORIGINAL_WORKSPACE, "tenants/mal/data/company-events.yaml")),
    chain: fingerprint(join(ORIGINAL_WORKSPACE, "tenants/mal/data/company-events-chain.jsonl")),
  };
}

export function assertMalCompanyEventsUnchanged(before: MalEventsFingerprint): void {
  const after = malCompanyEventsFingerprints();
  expect(after.registry).toBe(before.registry);
  expect(after.chain).toBe(before.chain);
}

export function setupTempCompanyEventsTenant(): {
  dir: string;
  tenantId: string;
  malBefore: MalEventsFingerprint;
  restore: () => void;
} {
  const malBefore = malCompanyEventsFingerprints();
  const prevWorkspace = process.env.ORGOS_WORKSPACE;
  const prevTenant = process.env.ORGOS_TENANT;
  const dir = mkdtempSync(join(tmpdir(), "orgos-ha-events-"));
  const tenantDir = join(dir, "tenants", HA_ISO_TENANT_ID);
  mkdirSync(join(tenantDir, "data", "org"), { recursive: true });
  mkdirSync(join(tenantDir, "docs"), { recursive: true });
  writeFileSync(
    join(tenantDir, "tenant.yaml"),
    [
      `id: ${HA_ISO_TENANT_ID}`,
      "name: HA isolation",
      "lifecycle: test",
      "operation_mode: development",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(tenantDir, "data", "org", "operators.yaml"),
    [
      'version: "1"',
      "operators:",
      `  - operator_id: ${HA_CEO_ID}`,
      "    display_name: HA CEO",
      "    role: ceo",
      "    status: active",
      `    key_hash: ${hashOperatorKey(HA_CEO_KEY)}`,
      `  - operator_id: ${HA_RO_ID}`,
      "    display_name: HA Readonly",
      "    role: readonly",
      "    status: active",
      `    key_hash: ${hashOperatorKey(HA_RO_KEY)}`,
      `  - operator_id: ${HA_OP_ID}`,
      "    display_name: HA Operator",
      "    role: operator",
      "    status: active",
      `    key_hash: ${hashOperatorKey(HA_OP_KEY)}`,
      "",
    ].join("\n"),
    "utf8",
  );

  process.env.ORGOS_WORKSPACE = dir;
  process.env.ORGOS_TENANT = HA_ISO_TENANT_ID;
  refreshOrgOsPaths();
  setTenantId(HA_ISO_TENANT_ID);
  clearOperatorsRegistryCacheForTests();
  clearAccessGrantsCacheForTests();
  setCliOperatorContext(undefined);
  initCompanyEventsFile();

  return {
    dir,
    tenantId: HA_ISO_TENANT_ID,
    malBefore,
    restore() {
      rmSync(dir, { recursive: true, force: true });
      if (prevWorkspace === undefined) delete process.env.ORGOS_WORKSPACE;
      else process.env.ORGOS_WORKSPACE = prevWorkspace;
      if (prevTenant === undefined) delete process.env.ORGOS_TENANT;
      else process.env.ORGOS_TENANT = prevTenant;
      refreshOrgOsPaths();
      setTenantId(prevTenant?.trim() || "mal");
      clearOperatorsRegistryCacheForTests();
      clearAccessGrantsCacheForTests();
      setCliOperatorContext(undefined);
      assertMalCompanyEventsUnchanged(malBefore);
    },
  };
}
