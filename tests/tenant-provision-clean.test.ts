import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { runTenantInit } from "../src/lib/tenant-init.js";
import {
  ensureCeoOperator,
  provisionLedgerTenant,
} from "../src/lib/product/ledger-provision.js";
import {
  clearOperatorsRegistryCacheForTests,
  isPublishedOperatorKeyHash,
  loadOperatorRegistry,
  registryHasPublishedOperatorKeys,
  saveOperatorRegistry,
  verifyOperatorKey,
} from "../src/lib/org/operators.js";
import { setTenantId } from "../src/lib/tenant.js";
import { runProdAuthChecks } from "../src/lib/console-auth/prod-checklist.js";
import { mintPasskeyBootstrapToken } from "../src/lib/wire-console/auth/passkey-bootstrap.js";
import { operatorRegistrySchema } from "../schemas/org/operator.js";

describe("tenant provision clean (Phase 1)", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    clearOperatorsRegistryCacheForTests();
    refreshOrgOsPaths();
  });

  function freshWorkspace(): void {
    workspace = mkdtempSync(join(tmpdir(), "tenant-provision-clean-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
  }

  it("runTenantInit does not copy template operators.yaml", () => {
    freshWorkspace();
    runTenantInit({ id: "clean-init-001", name: "Clean Init KK" });
    const operatorsPath = join(workspace, "tenants/clean-init-001/data/org/operators.yaml");
    expect(existsSync(operatorsPath)).toBe(false);
    expect(
      existsSync(join(workspace, "tenants/clean-init-001/data/org/operators.yaml.example")),
    ).toBe(true);
  });

  it("provisionLedgerTenant creates applicant-bound CEO without published keys", () => {
    freshWorkspace();
    const result = provisionLedgerTenant({
      tenantId: "clean-ceo-001",
      companyName: "Clean CEO KK",
      adminEmail: "founder@clean.example",
      plan: "starter",
    });
    expect(result.ceo_operator_id).toBe("OP-001");
    setTenantId("clean-ceo-001");
    clearOperatorsRegistryCacheForTests();
    const registry = loadOperatorRegistry();
    expect(registry?.operators).toHaveLength(1);
    const ceo = registry!.operators[0]!;
    expect(ceo.role).toBe("ceo");
    expect(ceo.email).toBe("founder@clean.example");
    expect(ceo.display_name).toBe("代表者");
    expect(ceo.key_hash).toBeUndefined();
    expect(isPublishedOperatorKeyHash(ceo.key_hash)).toBe(false);
    expect(
      existsSync(join(workspace, "tenants/clean-ceo-001/data/finance/opening-balances.yaml")),
    ).toBe(false);
  });

  it("provisionLedgerTenant is idempotent for CEO and does not overwrite finance", () => {
    freshWorkspace();
    const first = provisionLedgerTenant({
      tenantId: "clean-idem-001",
      companyName: "Idem KK",
      adminEmail: "ceo@idem.example",
      plan: "business",
    });
    setTenantId("clean-idem-001");
    const financeDir = join(workspace, "tenants/clean-idem-001/data/finance");
    const fixedAssetsPath = join(financeDir, "fixed-assets.yaml");
    const journalPath = join(financeDir, "journal-entries.yaml");
    writeFileSync(
      fixedAssetsPath,
      `as_of: "2026-08-31"\nfiscal_year: FY2026\ncurrency: JPY\nassets:\n  - id: FA-KEEP\n    name: keep-me\nsummary:\n  total_acquisition_cost: 1\n  total_accumulated_depreciation: 0\n  total_book_value: 1\n  annual_depreciation_fy_current: 0\n`,
      "utf-8",
    );
    writeFileSync(
      journalPath,
      `version: 1\nentries:\n  - entry_id: JE-KEEP\n    date: "2026-09-01"\n    lines: []\n`,
      "utf-8",
    );
    const fixedBefore = readFileSync(fixedAssetsPath, "utf-8");
    const journalBefore = readFileSync(journalPath, "utf-8");

    const second = provisionLedgerTenant({
      tenantId: "clean-idem-001",
      companyName: "Idem KK",
      adminEmail: "ceo@idem.example",
      plan: "business",
    });
    expect(second.ceo_operator_id).toBe(first.ceo_operator_id);
    clearOperatorsRegistryCacheForTests();
    expect(loadOperatorRegistry()?.operators.filter((op) => op.role === "ceo")).toHaveLength(1);
    expect(existsSync(join(financeDir, "opening-balances.yaml"))).toBe(false);
    expect(readFileSync(fixedAssetsPath, "utf-8")).toBe(fixedBefore);
    expect(readFileSync(journalPath, "utf-8")).toBe(journalBefore);
  });

  it("throws when a different active CEO already exists", () => {
    freshWorkspace();
    runTenantInit({ id: "clean-conflict-001", name: "Conflict KK" });
    setTenantId("clean-conflict-001");
    saveOperatorRegistry(
      operatorRegistrySchema.parse({
        version: "1",
        operators: [
          {
            operator_id: "OP-001",
            display_name: "Existing CEO",
            role: "ceo",
            status: "active",
            email: "other@conflict.example",
          },
        ],
      }),
    );
    expect(() =>
      ensureCeoOperator({ adminEmail: "founder@conflict.example" }),
    ).toThrow(/different email/);
  });

  it("mints bootstrap for provisioned CEO, not OP-CEO", () => {
    freshWorkspace();
    const result = provisionLedgerTenant({
      tenantId: "clean-boot-001",
      companyName: "Boot KK",
      adminEmail: "ceo@boot.example",
      plan: "starter",
    });
    setTenantId("clean-boot-001");
    clearOperatorsRegistryCacheForTests();
    const { token } = mintPasskeyBootstrapToken({
      operatorId: result.ceo_operator_id,
      ttl: "1h",
    });
    expect(token.startsWith("pkb_")).toBe(true);
    expect(() => mintPasskeyBootstrapToken({ operatorId: "OP-CEO" })).toThrow(
      /unknown or inactive/,
    );
  });

  it("prod checklist rejects published demo key hashes", () => {
    freshWorkspace();
    provisionLedgerTenant({
      tenantId: "clean-prod-001",
      companyName: "Prod Check KK",
      adminEmail: "ceo@prodcheck.example",
      plan: "starter",
    });
    setTenantId("clean-prod-001");
    clearOperatorsRegistryCacheForTests();
    saveOperatorRegistry(
      operatorRegistrySchema.parse({
        version: "1",
        operators: [
          {
            operator_id: "OP-001",
            display_name: "Demo CEO",
            role: "ceo",
            status: "active",
            email: "ceo@prodcheck.example",
            key_hash:
              "sha256:4a7c449d22a99026fac16a47621ff68792ff589f72334ea3950ce186a5615e9a",
          },
        ],
      }),
    );
    process.env.ORGOS_ENV = "production";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9470";
    process.env.ORGOS_MCP_TOKEN = "test-token";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET = "settlement-secret";
    expect(registryHasPublishedOperatorKeys()).toBe(true);
    const checks = runProdAuthChecks("all");
    const published = checks.find((c) => c.id === "operator_registry_no_published_keys");
    expect(published?.ok).toBe(false);
    expect(
      verifyOperatorKey(
        "sha256:4a7c449d22a99026fac16a47621ff68792ff589f72334ea3950ce186a5615e9a",
        "demo-operator-key",
      ),
    ).toBe(false);
  });
});
