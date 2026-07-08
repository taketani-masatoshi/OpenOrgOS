import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getWorkspaceRoot,
  getTenantsDir,
  workspaceConfigPath,
  isExternalWorkspace,
  refreshOrgOsPaths,
} from "../lib/orgos-paths.js";

export interface WorkspaceInitOptions {
  dir?: string;
  name?: string;
  json?: boolean;
}

export function runWorkspaceInit(opts: WorkspaceInitOptions = {}): void {
  const target = resolve(opts.dir ?? process.cwd());
  process.env.ORGOS_WORKSPACE = target;
  refreshOrgOsPaths();
  const configPath = join(target, "orgos.yaml");
  const tenantsDir = join(target, "tenants");

  if (existsSync(configPath) && !opts.json) {
    console.log(`✓ Workspace already initialized · ${configPath}`);
    return;
  }

  mkdirSync(tenantsDir, { recursive: true });
  writeFileSync(
    configPath,
    `# OrgOS workspace — company data lives under tenants/\nversion: "1"\nname: ${opts.name ?? "my-orgos-workspace"}\n`,
    "utf-8"
  );

  if (opts.json) {
    console.log(JSON.stringify({ workspace: target, config: configPath, tenants_dir: tenantsDir }, null, 2));
    return;
  }

  console.log(`✓ Workspace initialized · ${target}`);
  console.log(`  ${configPath}`);
  console.log(`  Next: cd ${target} && orgos tenant init <id> --name "Your Company"`);
  if (isExternalWorkspace()) {
    console.log(`  Tip: export ORGOS_WORKSPACE=${target}`);
  }
}

export interface WorkspaceShowOptions {
  json?: boolean;
}

export function runWorkspaceShow(opts: WorkspaceShowOptions = {}): void {
  const info = {
    workspace_root: getWorkspaceRoot(),
    orgos_yaml: workspaceConfigPath(),
    tenants_dir: getTenantsDir(),
    initialized: existsSync(workspaceConfigPath()) || existsSync(getTenantsDir()),
    external: isExternalWorkspace(),
  };
  if (opts.json) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }
  console.log(`Workspace: ${info.workspace_root}`);
  console.log(`  orgos.yaml: ${existsSync(info.orgos_yaml) ? "yes" : "no"}`);
  console.log(`  tenants/:  ${existsSync(info.tenants_dir) ? "yes" : "no"}`);
}
