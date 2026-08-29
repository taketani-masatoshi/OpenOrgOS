import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir, writeYamlFile } from "../src/lib/utils.js";
import { isAgentActive } from "../src/lib/agent-catalog.js";
import {
  agentRosterPath,
  loadTenantAgentRoster,
  setTenantAgentEnabled,
} from "../src/lib/agent-roster.js";
import {
  loadEnabledModulesSafe,
  loadModulesFile,
  modulesFilePath,
} from "../src/lib/modules.js";
import { isModuleInstalled } from "../src/lib/module-import.js";
import {
  applyTenantConfigChange,
  proposeTenantConfigChange,
  rejectTenantConfigChange,
} from "../src/lib/org/tenant-config-change.js";
import { buildAgentModuleInventory } from "../src/lib/steward-chat/agent-module-inventory.js";
import { modulesFileSchema } from "../schemas/modules.js";
import { preserveTenantSsot } from "./helpers/tenant-ssot-snapshot.js";

function cleanupOrgArtifacts(): void {
  for (const rel of ["org/pending-approvals.yaml", "org/config-change-requests.yaml"]) {
    const p = join(getDataDir(), rel);
    if (existsSync(p)) rmSync(p, { force: true });
  }
}

describe("WebUI agent/module toggles write the tenant SSOT", () => {
  preserveTenantSsot("mal");

  let originalAgents = "";
  let originalModules = "";

  beforeEach(() => {
    setTenantId("mal");
    originalAgents = readFileSync(agentRosterPath(), "utf-8");
    originalModules = readFileSync(modulesFilePath(), "utf-8");
    cleanupOrgArtifacts();
    process.env.STEWARD_OPERATOR_AUTH = "0";
  });

  afterEach(() => {
    if (originalAgents) writeFileSync(agentRosterPath(), originalAgents);
    if (originalModules) writeFileSync(modulesFilePath(), originalModules);
    cleanupOrgArtifacts();
  });

  it("agent Off writes agents.yaml and isAgentActive becomes false", () => {
    const before = buildAgentModuleInventory().agents.find((row) => row.id === "procurement");
    expect(before).toMatchObject({ enabled: true, locked: false });
    expect(isAgentActive("procurement", { profile: "operational" })).toBe(true);

    setTenantAgentEnabled("procurement", false);

    const roster = loadTenantAgentRoster().roster;
    expect(roster.disabled).toContain("procurement");
    expect(roster.profiles.operational).not.toContain("procurement");
    expect(isAgentActive("procurement", { profile: "operational", mode: "consult" })).toBe(
      false
    );
    expect(
      buildAgentModuleInventory().agents.find((row) => row.id === "procurement")?.enabled
    ).toBe(false);
  });

  it("agent Add only creates pending change until apply", () => {
    const sample = buildAgentModuleInventory().agents_available[0];
    expect(sample).toBeTruthy();
    const id = sample!.id;
    expect(isAgentActive(id as "procurement", { profile: "operational" })).toBe(false);

    const proposed = proposeTenantConfigChange({
      target: "agents",
      targetId: id,
      enabled: true,
      proposedBy: "op-steward",
    });
    expect(proposed.change.status).toBe("pending_approval");
    expect(loadTenantAgentRoster().roster.profiles.operational).not.toContain(id);
    expect(
      buildAgentModuleInventory().agents_available.find((row) => row.id === id)?.pending
    ).toMatchObject({ to_enabled: true, approval_id: proposed.approval_id });

    const applied = applyTenantConfigChange(proposed.change.change_id);
    expect(applied.change.status).toBe("applied");
    expect(loadTenantAgentRoster().roster.profiles.operational).toContain(id);
    expect(isAgentActive(id as "procurement", { profile: "operational" })).toBe(true);

    setTenantAgentEnabled(id, false);
  });

  it("module catalog Add proposes import_enable without importing until apply", () => {
    const catalog = buildAgentModuleInventory().modules_catalog[0];
    expect(catalog).toBeTruthy();
    const id = catalog!.id;

    const proposed = proposeTenantConfigChange({
      target: "modules",
      targetId: id,
      enabled: true,
      action: "import_enable",
      proposedBy: "op-steward",
    });
    expect(proposed.change.action).toBe("import_enable");
    expect(isModuleInstalled(id)).toBe(false);
    expect(
      buildAgentModuleInventory().modules_catalog.find((row) => row.id === id)?.pending
    ).toMatchObject({ to_enabled: true, approval_id: proposed.approval_id });

    const applied = applyTenantConfigChange(proposed.change.change_id);
    expect(applied.change.status).toBe("applied");
    expect(isModuleInstalled(id)).toBe(true);
    expect(loadEnabledModulesSafe().some((mod) => mod.id === id)).toBe(true);
  });

  it("required agents cannot be turned Off; module-bound Off is synced back On", () => {
    expect(() => setTenantAgentEnabled("executive_steward", false)).toThrow(/required/);
    expect(isAgentActive("executive_steward", { profile: "operational" })).toBe(true);

    const after = setTenantAgentEnabled("investor_relations", false);
    expect(after.disabled).not.toContain("investor_relations");
    expect(after.profiles.operational).toContain("investor_relations");
    expect(isAgentActive("investor_relations", { profile: "operational" })).toBe(true);
    expect(
      buildAgentModuleInventory().agents.find((row) => row.id === "investor_relations")
    ).toMatchObject({ enabled: true, locked: true, lock_reason: "module_enabled" });
  });

  it("module switch only creates a pending change; modules.yaml stays Off", () => {
    expect(loadEnabledModulesSafe().some((mod) => mod.id === "professional_services")).toBe(
      false
    );

    const proposed = proposeTenantConfigChange({
      target: "modules",
      targetId: "professional_services",
      enabled: true,
      proposedBy: "op-steward",
    });
    expect(proposed.change.status).toBe("pending_approval");
    expect(loadEnabledModulesSafe().some((mod) => mod.id === "professional_services")).toBe(
      false
    );
    expect(
      buildAgentModuleInventory().modules_installed.find(
        (row) => row.id === "professional_services"
      )
    ).toMatchObject({
      enabled: false,
      pending: { to_enabled: true, approval_id: proposed.approval_id },
    });

    rejectTenantConfigChange({
      approvalId: proposed.approval_id,
      approverId: "CEO",
      reason: "toggle-effect test cleanup",
    });
  });

  it("approved apply actually flips modules.yaml enabled", () => {
    const file = loadModulesFile();
    const mod = file.modules.find((row) => row.id === "professional_services");
    expect(mod).toBeTruthy();
    mod!.enabled = true;
    writeYamlFile(modulesFilePath(), modulesFileSchema.parse(file));
    expect(loadEnabledModulesSafe().some((row) => row.id === "professional_services")).toBe(
      true
    );

    const proposed = proposeTenantConfigChange({
      target: "modules",
      targetId: "professional_services",
      enabled: false,
      proposedBy: "op-steward",
    });
    const applied = applyTenantConfigChange(proposed.change.change_id);
    expect(applied.change.status).toBe("applied");
    expect(loadEnabledModulesSafe().some((row) => row.id === "professional_services")).toBe(
      false
    );
    expect(
      buildAgentModuleInventory().modules_installed.find(
        (row) => row.id === "professional_services"
      )?.enabled
    ).toBe(false);
  });
});
