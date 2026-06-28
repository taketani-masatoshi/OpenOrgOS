import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  getInstallRoot,
  getWorkspaceRoot,
  getTenantsDir,
  getTenantTemplateDir,
  getAppsDir,
  workspaceConfigPath,
  isExternalWorkspace,
} from "../lib/orgos-paths.js";
import { listTenantIds } from "../lib/tenant.js";
import { STEWARD_CORE_DIR } from "../lib/steward-paths.js";

export interface DoctorOptions {
  json?: boolean;
}

interface DoctorCheck {
  id: string;
  ok: boolean;
  detail: string;
}

function checkNode(): DoctorCheck {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    id: "node",
    ok: major >= 20,
    detail: `Node ${process.version} (requires >= 20)`,
  };
}

function checkOpenSsl(): DoctorCheck {
  try {
    execFileSync("openssl", ["version"], { stdio: "pipe" });
    return { id: "openssl", ok: true, detail: "OpenSSL available (Wire mTLS / Proposal 3)" };
  } catch {
    return { id: "openssl", ok: false, detail: "OpenSSL not found — required for protocol tls / Proposal 3" };
  }
}

function checkInstallRoot(): DoctorCheck {
  const ok = existsSync(STEWARD_CORE_DIR);
  return {
    id: "install_root",
    ok,
    detail: ok ? getInstallRoot() : "Framework missing — set ORGOS_HOME",
  };
}

function checkWorkspace(): DoctorCheck {
  const hasConfig = existsSync(workspaceConfigPath());
  const tenantIds = listTenantIds();
  const ok = hasConfig || tenantIds.length > 0;
  return {
    id: "workspace",
    ok,
    detail: hasConfig
      ? `Workspace ${getWorkspaceRoot()} (${tenantIds.length} tenant(s))`
      : tenantIds.length
        ? `Workspace ${getWorkspaceRoot()} · tenants: ${tenantIds.join(", ")}`
        : "No workspace — run: orgos workspace init",
  };
}

function checkTenantTemplate(): DoctorCheck {
  const templateDir = getTenantTemplateDir();
  const ok = existsSync(templateDir);
  return {
    id: "tenant_template",
    ok,
    detail: ok ? templateDir : "tenants/_template missing from install package",
  };
}

function checkWireConsoleDist(): DoctorCheck {
  const dist = join(getAppsDir(), "wire-console", "dist", "index.html");
  const ok = existsSync(dist);
  return {
    id: "wire_console_dist",
    ok,
    detail: ok
      ? "Wire Console SPA built"
      : "Wire Console not built — run: orgos wire console build (or npm run wire-console:build in dev repo)",
  };
}

export function runDoctor(opts: DoctorOptions = {}): void {
  const checks: DoctorCheck[] = [
    checkNode(),
    checkOpenSsl(),
    checkInstallRoot(),
    checkWorkspace(),
    checkTenantTemplate(),
    checkWireConsoleDist(),
  ];
  const failed = checks.filter((c) => !c.ok);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          install_root: getInstallRoot(),
          workspace_root: getWorkspaceRoot(),
          tenants_dir: getTenantsDir(),
          external_workspace: isExternalWorkspace(),
          checks,
          ok: failed.length === 0,
        },
        null,
        2
      )
    );
    if (failed.length) process.exit(1);
    return;
  }

  console.log("OrgOS doctor\n");
  console.log(`  Install:   ${getInstallRoot()}`);
  console.log(`  Workspace: ${getWorkspaceRoot()}${isExternalWorkspace() ? " (external)" : ""}\n`);
  for (const c of checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.id}: ${c.detail}`);
  }
  if (failed.length) {
    console.log(`\n${failed.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All checks passed");
}
