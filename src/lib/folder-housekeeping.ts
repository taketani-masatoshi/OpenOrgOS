import { existsSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getWorkspaceRoot } from "./orgos-paths.js";

export interface HousekeepingFinding {
  id: string;
  severity: "warn" | "info";
  ok: boolean;
  detail: string;
  path?: string;
  fixable?: boolean;
}

export interface HousekeepingResult {
  findings: HousekeepingFinding[];
  fixed: string[];
}

const LEGACY_DATA_STUB = `# ⚠️ 移行済み — docs/exports/

**2026-06 再編:** CSV 台帳は [\`docs/exports/\`](../exports/00-このフォルダについて.md) に集約しました。

このスタブは 2026-12 まで維持します。
`;

function listTenantIdsFrom(tenantsDir: string): string[] {
  if (!existsSync(tenantsDir)) return [];
  return readdirSync(tenantsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
    .map((d) => d.name)
    .filter((id) => existsSync(join(tenantsDir, id, "tenant.yaml")));
}

function isDirEmpty(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).length === 0;
}

function findStaleScratchFiles(scratchDir: string, maxAgeDays = 30): string[] {
  if (!existsSync(scratchDir)) return [];
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const stale: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, name.name);
      if (name.isDirectory()) {
        walk(path);
        continue;
      }
      if (name.name === "00-README.md" || name.name === ".DS_Store") continue;
      if (statSync(path).mtimeMs < cutoff) stale.push(path);
    }
  };
  walk(scratchDir);
  return stale;
}

export function runHousekeepingChecks(root = getWorkspaceRoot()): HousekeepingFinding[] {
  const findings: HousekeepingFinding[] = [];
  const tenantsDir = join(root, "tenants");

  const cursorDir = join(root, "cursor");
  if (existsSync(cursorDir) && isDirEmpty(cursorDir)) {
    findings.push({
      id: "root_cursor_dir",
      severity: "warn",
      ok: false,
      detail: "空のルート cursor/ が残っています（.cursor/ と別物）",
      path: cursorDir,
      fixable: true,
    });
  }

  for (const name of readdirSync(root)) {
    if (/^orgos-.*\.tgz$/.test(name)) {
      findings.push({
        id: "root_tgz",
        severity: "warn",
        ok: false,
        detail: `ルートに npm pack 成果物: ${name}`,
        path: join(root, name),
        fixable: true,
      });
    }
  }

  const dsStore = join(root, "scratch", ".DS_Store");
  if (existsSync(dsStore)) {
    findings.push({
      id: "scratch_ds_store",
      severity: "warn",
      ok: false,
      detail: "scratch/.DS_Store が残っています",
      path: dsStore,
      fixable: true,
    });
  }

  const dataReadme = join(root, "data", "00-README.md");
  if (existsSync(join(root, "data")) && !existsSync(dataReadme)) {
    findings.push({
      id: "root_data_readme",
      severity: "warn",
      ok: false,
      detail: "ルート data/00-README.md がありません（テナント data/ と区別用）",
      path: dataReadme,
      fixable: false,
    });
  }

  for (const tenantId of listTenantIdsFrom(tenantsDir)) {
    const docsDir = join(tenantsDir, tenantId, "docs");
    const corporateDir = join(docsDir, "corporate");
    if (existsSync(corporateDir) && isDirEmpty(corporateDir)) {
      findings.push({
        id: "tenant_empty_corporate",
        severity: "warn",
        ok: false,
        detail: `空の tenants/${tenantId}/docs/corporate/`,
        path: corporateDir,
        fixable: true,
      });
    }

    const legacyDataDir = join(docsDir, "data");
    if (existsSync(legacyDataDir)) {
      for (const name of readdirSync(legacyDataDir)) {
        if (!name.endsWith(".csv")) continue;
        const csvPath = join(legacyDataDir, name);
        const exportsPath = join(docsDir, "exports", name);
        if (existsSync(exportsPath)) {
          findings.push({
            id: "tenant_legacy_csv",
            severity: "warn",
            ok: false,
            detail: `legacy CSV: tenants/${tenantId}/docs/data/${name}（正本: docs/exports/）`,
            path: csvPath,
            fixable: true,
          });
        }
      }
    }
  }

  const stale = findStaleScratchFiles(join(root, "scratch"));
  for (const path of stale) {
    const rel = path.replace(root + "/", "");
    findings.push({
      id: "scratch_stale",
      severity: "info",
      ok: false,
      detail: `scratch 内 30 日超: ${rel}`,
      path,
      fixable: false,
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: "all_clear",
      severity: "info",
      ok: true,
      detail: "片付け対象なし",
    });
  }

  return findings;
}

export function applyHousekeepingFixes(
  findings: HousekeepingFinding[],
  root = getWorkspaceRoot()
): string[] {
  const fixed: string[] = [];

  for (const f of findings) {
    if (!f.fixable || !f.path) continue;

    if (f.id === "root_cursor_dir" && isDirEmpty(f.path)) {
      rmSync(f.path, { recursive: true });
      fixed.push(f.path);
      continue;
    }

    if (f.id === "root_tgz" && existsSync(f.path)) {
      unlinkSync(f.path);
      fixed.push(f.path);
      continue;
    }

    if (f.id === "scratch_ds_store" && existsSync(f.path)) {
      unlinkSync(f.path);
      fixed.push(f.path);
      continue;
    }

    if (f.id === "tenant_empty_corporate" && isDirEmpty(f.path)) {
      rmSync(f.path, { recursive: true });
      fixed.push(f.path);
      continue;
    }

    if (f.id === "tenant_legacy_csv" && existsSync(f.path)) {
      const legacyDir = join(f.path, "..");
      unlinkSync(f.path);
      fixed.push(f.path);
      const stub = join(legacyDir, "00-このフォルダについて.md");
      if (!existsSync(stub)) {
        writeFileSync(stub, LEGACY_DATA_STUB, "utf8");
        fixed.push(stub);
      }
    }
  }

  return fixed;
}

export function runHousekeeping(opts: { fix?: boolean; json?: boolean } = {}): void {
  const root = getWorkspaceRoot();
  const findings = runHousekeepingChecks(root);
  const actionable = findings.filter((f) => !f.ok);
  const warnings = actionable.filter((f) => f.severity === "warn");
  const fixed = opts.fix ? applyHousekeepingFixes(findings, root) : [];

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          workspace_root: root,
          findings,
          fixed,
          ok: warnings.length === 0,
        },
        null,
        2
      )
    );
    if (warnings.length) process.exit(1);
    return;
  }

  console.log("OrgOS housekeeping\n");
  console.log(`  Workspace: ${root}\n`);
  for (const f of findings) {
    const mark = f.ok ? "✓" : f.severity === "warn" ? "!" : "·";
    console.log(`  ${mark} ${f.id}: ${f.detail}`);
  }
  if (opts.fix && fixed.length) {
    console.log("\n  Fixed:");
    for (const p of fixed) console.log(`    - ${p.replace(root + "/", "")}`);
  } else if (warnings.some((f) => f.fixable)) {
    console.log("\n  自動修正: orgos housekeeping --fix");
  }
  console.log("\n  正本: steward/rules/folder-housekeeping.md");
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s)`);
    process.exit(1);
  }
  console.log("\n✓ All clear");
}
