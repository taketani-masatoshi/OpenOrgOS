// @catalog-coverage: full
// @catalog-ids: hospitality

import { Command } from "commander";
import { beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { getModuleTier } from "../src/lib/module-readiness.js";
import {
  checkModuleCatalogOnly,
  loadModuleManifest,
} from "../src/lib/modules.js";
import { listModuleCliBundles, registerModuleCli } from "../src/lib/module-cli.js";
import {
  checkOperationsRecords,
  formatRecordsCheck,
} from "../steward/modules/hospitality/cli/records-check.js";

function command(parent: Command, name: string): Command {
  const found = parent.commands.find((candidate) => candidate.name() === name);
  if (!found) throw new Error(`missing command: ${parent.name()} ${name}`);
  return found;
}

describe("hospitality module", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("has manifest and registers CLI bundle", () => {
    const manifest = loadModuleManifest("hospitality");
    expect(manifest?.id).toBe("hospitality");
    expect(getModuleTier("hospitality")).toBe("production_ready");
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain("hospitality");
  });

  it("passes catalog-only readiness check", () => {
    const issues = checkModuleCatalogOnly("hospitality", "production_ready");
    expect(issues, JSON.stringify(issues)).toEqual([]);
  });

  it("records-check runs without error on mal tenant", () => {
    const result = checkOperationsRecords();
    const md = formatRecordsCheck(result);
    expect(md).toContain("operations/records チェック");
    expect(typeof result.totalRows).toBe("number");
  });

  it("registers hospitality operations subcommands including register-validate", () => {
    const program = new Command().name("orgos").exitOverride();
    const operations = registerModuleCli(program);
    const hospitality = command(operations, "hospitality");
    const names = hospitality.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining([
        "stays",
        "show",
        "stay-upsert",
        "check-in",
        "check-out",
        "metrics",
        "ota-import",
        "tax-compute",
        "tax-status",
        "tax-pack",
        "tax-filed",
        "tax-pay",
        "ops-due",
        "records-check",
        "register-validate",
        "register-append",
        "blockers",
        "nights-cap",
        "cleaning-order",
        "damage-log",
      ])
    );
    expect(names.length).toBeGreaterThanOrEqual(34);
  });
});
