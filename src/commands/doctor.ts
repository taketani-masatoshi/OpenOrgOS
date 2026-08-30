import { existsSync, readFileSync, rmSync } from "node:fs";
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
import { computeIntegrationsStatus } from "../lib/integrations-status.js";
import { getTenantId, listTenantIds, setTenantId } from "../lib/tenant.js";
import { STEWARD_CORE_DIR } from "../lib/steward-paths.js";
import { runProdWireGate } from "../lib/protocol/prod-wire-gate.js";
import { collectOperationalReadinessIssues } from "../lib/scheduling-coordination/operational-readiness.js";
import { runProdAuthChecks } from "../lib/console-auth/prod-checklist.js";
import {
  deriveGrantsFromEvents,
  isFsGuardInitialized,
  isFsGuardProdMode,
  loadGrantEvents,
  loadIdentities,
} from "../lib/org/fs-guard/index.js";
import { countCanonicalWriteBaselineEntries } from "../lib/org/fs-guard/canonical-write-baseline.js";
import { listSkillsMissingFsGuardAgent } from "../lib/org/fs-guard/skill-agent-context.js";
import { aiaRuntimeConfigPath, loadAiaRuntimeConfig } from "../lib/aia/scheduler.js";
import {
  checkConcurrentJobsManifest,
  formatConcurrentJobsManifestTable,
} from "../lib/aia/concurrent-jobs-manifest.js";
import {
  assessGovernancePrinciples,
  governancePrinciplesRulePath,
  iso37000ControlMapPath,
} from "../lib/org/governance-principles.js";
import { listAvailableIsoIds, verifyIsoMaps } from "../lib/iso-catalog.js";
import { loadRecordSpecs } from "../lib/iso-records.js";
import { loadRequirements } from "../lib/iso-requirements.js";

export interface DoctorOptions {
  json?: boolean;
  wireProd?: boolean;
  tenant?: string;
  repair?: boolean;
}

export interface DoctorCheck {
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

function checkIntegrationsSetup(): DoctorCheck {
  const tenant = getTenantId();
  const report = computeIntegrationsStatus(tenant);
  return {
    id: "integrations_setup",
    ok: true,
    detail: report.setup_completed
      ? `completed ${report.setup_completed_at ?? ""} · score ${report.score_pct}%`
      : `WARN: not completed — run orgos tenant setup (score ${report.score_pct}%)`,
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

function checkPdfkitDependency(): DoctorCheck {
  const pkgPath = join(getInstallRoot(), "node_modules", "pdfkit", "package.json");
  const ok = existsSync(pkgPath);
  return {
    id: "pdfkit",
    ok,
    detail: ok
      ? "pdfkit installed (PDF export / broker)"
      : "pdfkit missing — run: npm ci",
  };
}

function checkFixtureRestoreLock(opts?: { repair?: boolean }): DoctorCheck {
  const lockDir = join(getWorkspaceRoot(), "tests", ".fixture-restore.lock");
  if (!existsSync(lockDir)) {
    return { id: "fixture_restore_lock", ok: true, detail: "no stale Vitest fixture lock" };
  }
  const ownerPath = join(lockDir, "owner");
  let owner = 0;
  try {
    const raw = readFileSync(ownerPath, "utf-8").trim().split(/\s+/)[0] ?? "";
    owner = Number(raw);
  } catch {
    if (opts?.repair) {
      rmSync(lockDir, { recursive: true, force: true });
      return { id: "fixture_restore_lock", ok: true, detail: "removed broken tests/.fixture-restore.lock" };
    }
    return {
      id: "fixture_restore_lock",
      ok: false,
      detail: "stale tests/.fixture-restore.lock — run: orgos doctor --repair",
    };
  }
  let alive = false;
  try {
    process.kill(owner, 0);
    alive = true;
  } catch {
    alive = false;
  }
  if (!alive && opts?.repair) {
    rmSync(lockDir, { recursive: true, force: true });
    return { id: "fixture_restore_lock", ok: true, detail: `removed stale fixture lock (dead pid ${owner})` };
  }
  return {
    id: "fixture_restore_lock",
    ok: !alive || owner === process.pid,
    detail: alive
      ? `Vitest fixture restore in progress (pid ${owner})`
      : "stale tests/.fixture-restore.lock — run: orgos doctor --repair",
  };
}

function checkFsGuard(): DoctorCheck {
  try {
    if (isFsGuardProdMode() && process.env.ORGOS_FS_GUARD === "off") {
      return {
        id: "fs_guard",
        ok: false,
        detail: "ORGOS_FS_GUARD=off is forbidden in production",
      };
    }
    if (!isFsGuardInitialized()) {
      const required = isFsGuardProdMode() || process.env.ORGOS_FS_GUARD === "enforce";
      return {
        id: "fs_guard",
        ok: !required,
        detail: required
          ? "FS-guard required — orgos guard init"
          : "FS-guard not initialized (optional) — orgos guard init",
      };
    }
    const identities = loadIdentities();
    if (!identities) {
      return { id: "fs_guard", ok: false, detail: "identities.yaml missing after init" };
    }
    deriveGrantsFromEvents(loadGrantEvents(), identities.issuer.public_key);
    return {
      id: "fs_guard",
      ok: true,
      detail: `issuer ${identities.issuer.key_id} · ${identities.agents.length} agent key(s)`,
    };
  } catch (err) {
    return {
      id: "fs_guard",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkFsGuardCanonicalWriteBaseline(): DoctorCheck {
  const count = countCanonicalWriteBaselineEntries();
  return {
    id: "fs_guard_canonical_write_baseline",
    ok: true,
    detail:
      count === 0
        ? "no documented unhooked direct writes"
        : `${count} documented direct write(s) pending migration — npm run check:canonical-writes`,
  };
}

function checkFsGuardSkillAgentContext(): DoctorCheck {
  try {
    const missing = listSkillsMissingFsGuardAgent();
    return {
      id: "fs_guard_skill_agent_context",
      ok: true,
      detail:
        missing.length === 0
          ? "CLI skills resolve FS-guard agent (agent_id or module fallback)"
          : `WARN: CLI skills without agent context: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""} — assign agent_id or enable module fallback before enforce`,
    };
  } catch (err) {
    return {
      id: "fs_guard_skill_agent_context",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function checkIso37000Pack(): DoctorCheck {
  const rule = existsSync(governancePrinciplesRulePath());
  const map = existsSync(iso37000ControlMapPath());
  const ok = rule && map;
  return {
    id: "iso37000_pack",
    ok,
    detail: ok
      ? "ISO-37000 pack + governance-principles.md"
      : "ERROR: governance-principles.md or ISO-37000 control-map missing",
  };
}

function checkIsoRegisters(): DoctorCheck {
  const missing: string[] = [];
  for (const id of listAvailableIsoIds()) {
    const reqs = loadRequirements(id)?.requirements ?? [];
    const recs = loadRecordSpecs(id)?.records ?? [];
    if (reqs.length === 0) missing.push(`${id} requirements empty`);
    if (recs.length === 0) missing.push(`${id} records empty`);
  }
  return {
    id: "iso_registers",
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? `ISO registers filled (${listAvailableIsoIds().length} available packs)`
        : `ERROR: ${missing.join("; ")}`,
  };
}

function checkIsoCatalogMaps(): DoctorCheck {
  const { ok, statuses } = verifyIsoMaps();
  const verified = statuses.filter((s) => !s.skipped);
  const skipped = statuses.length - verified.length;
  const failed = verified.filter((s) => !s.map_ok || !s.folder_ok);
  return {
    id: "iso_catalog_maps",
    ok,
    detail: ok
      ? `ISO catalog maps parse (${verified.length} available · ${skipped} coming soon)`
      : `ERROR: ${failed.map((s) => `${s.id}: ${s.error ?? "fail"}`).join("; ")}`,
  };
}

function checkIso37000Tenant(): DoctorCheck {
  const status = assessGovernancePrinciples();
  if (status.self_declared) {
    return {
      id: "iso37000_self_declaration",
      ok: true,
      detail: `self_declared (${status.principles_ok}/${status.principles_total})`,
    };
  }
  if (status.ready_for_self_declaration) {
    return {
      id: "iso37000_self_declaration",
      ok: true,
      detail: `ready to declare (${status.principles_ok}/${status.principles_total}) — orgos governance principles declare`,
    };
  }
  return {
    id: "iso37000_self_declaration",
    ok: true,
    detail: `WARN: ISO 37000 ${status.principles_ok}/${status.principles_total} · purpose=${status.purpose_ok} · applicability=${status.applicability_ok} — orgos governance principles status`,
  };
}

function checkAiaConcurrentJobs(): DoctorCheck {
  const issues = checkConcurrentJobsManifest();
  if (issues.length > 0) {
    return {
      id: "aia_concurrent_jobs",
      ok: false,
      detail: issues.map((i) => `${i.moduleId}: ${i.message}`).join("; "),
    };
  }
  const enabled = formatConcurrentJobsManifestTable()
    .split("\n")
    .filter((line) => line.includes("| yes |"))
    .length;
  return {
    id: "aia_concurrent_jobs",
    ok: true,
    detail: `enabled modules validated (${enabled} rows with concurrent_jobs metadata)`,
  };
}

function checkAiaRuntime(): DoctorCheck {
  try {
    const config = loadAiaRuntimeConfig();
    const path = aiaRuntimeConfigPath();
    const exists = existsSync(path);
    return {
      id: "aia_runtime",
      ok: true,
      detail: exists
        ? `tier=${config.tier} max=${config.max_concurrent_aia} queue_timeout=${config.queue_timeout_seconds}s (${path})`
        : `defaults tier=${config.tier} max=${config.max_concurrent_aia} — seed: data/org/aia-runtime.yaml`,
    };
  } catch (err) {
    return {
      id: "aia_runtime",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export function collectDoctorChecks(opts: DoctorOptions = {}): {
  checks: DoctorCheck[];
  nextCommand?: string;
} {
  const tenant = opts.tenant ?? process.env.ORGOS_TENANT;
  if (tenant) setTenantId(tenant);

  const checks: DoctorCheck[] = [
    checkNode(),
    checkOpenSsl(),
    checkInstallRoot(),
    checkWorkspace(),
    checkTenantTemplate(),
    checkPdfkitDependency(),
    checkFixtureRestoreLock({ repair: opts.repair }),
    checkWireConsoleDist(),
    checkIntegrationsSetup(),
    checkFsGuard(),
    checkFsGuardCanonicalWriteBaseline(),
    checkFsGuardSkillAgentContext(),
    checkAiaRuntime(),
    checkAiaConcurrentJobs(),
    checkIso37000Pack(),
    checkIsoCatalogMaps(),
    checkIsoRegisters(),
    ...runProdAuthChecks("all").map((c) => ({
      id: c.id,
      ok: c.ok,
      detail: c.warn && c.ok ? `WARN: ${c.detail}` : c.detail,
    })),
  ];

  let nextCommand: string | undefined;

  if (tenant) {
    const ops = collectOperationalReadinessIssues({
      repairApprovals: opts.repair,
      ensureMailConfig: opts.repair,
      syncOperatorKeys: opts.repair,
      repairOperatorKeys: opts.repair,
    });
    nextCommand = ops.next_command;
    for (const issue of ops.issues) {
      checks.push({
        id: issue.id,
        ok: issue.severity !== "error",
        detail: `${issue.severity === "error" ? "ERROR" : "WARN"}: ${issue.message} — ${issue.fix}`,
      });
    }
    if (ops.synced_operators.length) {
      checks.push({
        id: "operator_key_sync",
        ok: true,
        detail: `synced operator key_hash: ${ops.synced_operators.join(", ")}`,
      });
    }
    if (ops.rotated_operators.length) {
      checks.push({
        id: "operator_key_rotate",
        ok: true,
        detail: `rotated operator key: ${ops.rotated_operators.join(", ")}`,
      });
    }
    if (ops.repaired_approvals.length) {
      checks.push({
        id: "approval_registry_repair",
        ok: true,
        detail: `repaired ${ops.repaired_approvals.length} draft approval(s): ${ops.repaired_approvals.join(", ")}`,
      });
    }
    checks.push(checkIso37000Tenant());
  }

  return { checks, nextCommand };
}

export function runDoctor(opts: DoctorOptions = {}): void {
  const tenant = opts.tenant ?? process.env.ORGOS_TENANT;
  if (tenant) setTenantId(tenant);

  if (opts.wireProd) {
    const wireTenant = tenant ?? "mal";
    setTenantId(wireTenant);
    process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY ??= "1";
    process.env.ORGOS_STRICT_TRUST_JURISDICTIONS ??= "JP";
    const gate = runProdWireGate({
      tenantId: wireTenant,
      strictTrust: true,
      strictTls: true,
      strictTransport: true,
      govLive: true,
      publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `https://wire.${tenant}.example`,
    });
    if (opts.json) {
      console.log(JSON.stringify({ tenant, ...gate }, null, 2));
      if (!gate.ok) process.exit(1);
      return;
    }
    console.log(`OrgOS doctor — wire production gate (${tenant})\n`);
    for (const c of gate.checks) {
      console.log(`  ${c.ok ? "✓" : "✗"} ${c.id}: ${c.detail}`);
      if (!c.ok && c.issues?.length) {
        for (const issue of c.issues.slice(0, 5)) {
          console.log(`      ${issue}`);
        }
      }
    }
    if (!gate.ok) {
      console.log("\nWire production gate failed");
      process.exit(1);
    }
    console.log("\n✓ Wire production gate passed");
    return;
  }

  const { checks, nextCommand: schedulingNextCommand } = collectDoctorChecks(opts);
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
  if (schedulingNextCommand) {
    console.log(`\nnext: ${schedulingNextCommand}`);
  }
}
