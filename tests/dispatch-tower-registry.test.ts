import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dispatchTowerRegistryPath,
  loadDispatchTowerRegistry,
  resetDispatchTowerRegistryForTests,
} from "../src/lib/dispatch-tower/registry-loader.js";
import {
  getInstallRoot,
  getWorkspaceRoot,
  refreshOrgOsPaths,
  resolveFrameworkFile,
} from "../src/lib/orgos-paths.js";

describe("dispatch-tower registry path", () => {
  const env = { ...process.env };
  let home = "";
  let workspace = "";

  beforeEach(() => {
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    home = join(tmpdir(), `orgos-home-${stamp}`);
    workspace = join(tmpdir(), `orgos-ws-${stamp}`);
    mkdirSync(join(home, "steward", "core"), { recursive: true });
    mkdirSync(join(home, "schemas"), { recursive: true });
    mkdirSync(join(workspace, "tenants"), { recursive: true });
    mkdirSync(join(workspace, "steward", "core", "dispatch-tower"), { recursive: true });
    writeFileSync(
      join(workspace, "steward", "core", "dispatch-tower", "registry.yaml"),
      'version: "1"\n',
    );
    process.env.ORGOS_HOME = home;
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    resetDispatchTowerRegistryForTests();
  });

  afterEach(() => {
    process.env = { ...env };
    refreshOrgOsPaths();
    resetDispatchTowerRegistryForTests();
    rmSync(home, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  it("resolveFrameworkFile uses the workspace copy when the install image is stale", () => {
    const missing = join(getInstallRoot(), "steward", "core", "dispatch-tower", "registry.yaml");
    expect(resolveFrameworkFile(missing)).toBe(
      join(getWorkspaceRoot(), "steward", "core", "dispatch-tower", "registry.yaml"),
    );
  });

  it("loads the workspace registry when ORGOS_HOME has no dispatch-tower", () => {
    expect(dispatchTowerRegistryPath()).toContain("/steward/core/dispatch-tower/registry.yaml");
    const registry = loadDispatchTowerRegistry();
    expect(registry.version).toBe("1");
  });

  it("returns an empty registry instead of throwing when the file is absent", () => {
    rmSync(join(workspace, "steward", "core", "dispatch-tower"), { recursive: true, force: true });
    resetDispatchTowerRegistryForTests();
    const registry = loadDispatchTowerRegistry();
    expect(registry.version).toBe("1");
    expect(registry.judgment_patterns).toEqual([]);
  });
});
