import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyTenantGitRemote } from "../src/lib/tenant-git-remote.js";
import {
  checkTenantBackupForWeekly,
  restoreTenantBackup,
  snapshotTenantBackup,
  tenantBackupStampPath,
} from "../src/lib/tenant-backup.js";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "orgos-tenant-backup-"));
  roots.push(root);
  return root;
}

function writeTarget(tenantDir: string, destination: string, extra = ""): void {
  const org = join(tenantDir, "data", "org");
  mkdirSync(org, { recursive: true });
  writeFileSync(
    join(org, "backup-target.yaml"),
    `version: 1\ndestination: ${destination}\nvolume_encrypted: true\n${extra}`,
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("tenant backup", () => {
  it("does not fail weekly when no destination is configured", () => {
    const tenantDir = join(tempRoot(), "demo");
    mkdirSync(tenantDir, { recursive: true });
    const check = checkTenantBackupForWeekly(tenantDir, new Date("2026-09-21T12:00:00"));
    expect(check.ok).toBe(true);
    expect(check.message).toContain("未設定");
  });

  it("fails weekly when a destination is configured and the stamp is missing or old", () => {
    const root = tempRoot();
    const tenantDir = join(root, "demo");
    mkdirSync(tenantDir, { recursive: true });
    writeTarget(tenantDir, join(root, "nas"));
    const missing = checkTenantBackupForWeekly(tenantDir, new Date("2026-09-21T12:00:00"));
    expect(missing.ok).toBe(false);

    mkdirSync(join(tenantDir, "scratch"), { recursive: true });
    writeFileSync(tenantBackupStampPath(tenantDir), "2026-09-01\n");
    const stale = checkTenantBackupForWeekly(tenantDir, new Date("2026-09-21T12:00:00"));
    expect(stale.ok).toBe(false);
    expect(stale.message).toContain("7 日");
  });

  it("snapshots without in-flight drafts and stamps only after tar succeeds", () => {
    const root = tempRoot();
    const tenantDir = join(root, "acme");
    const nas = join(root, "nas");
    mkdirSync(join(tenantDir, "data"), { recursive: true });
    mkdirSync(join(tenantDir, "scratch", "aia-runs"), { recursive: true });
    mkdirSync(join(tenantDir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(tenantDir, "data", "keep.txt"), "ledger");
    writeFileSync(join(tenantDir, "scratch", "aia-runs", "draft.txt"), "in-flight");
    writeFileSync(join(tenantDir, "node_modules", "pkg", "index.js"), "skip");
    writeTarget(tenantDir, join(tenantDir, "inside"));

    expect(() =>
      snapshotTenantBackup({
        tenantDir,
        tenantId: "acme",
        now: new Date("2026-09-21T15:04:05"),
      }),
    ).toThrow(/外/);
    expect(existsSync(tenantBackupStampPath(tenantDir))).toBe(false);

    writeTarget(tenantDir, nas);
    const snap = snapshotTenantBackup({
      tenantDir,
      tenantId: "acme",
      now: new Date("2026-09-21T15:04:05"),
    });
    expect(existsSync(snap.archivePath)).toBe(true);
    expect(readFileSync(tenantBackupStampPath(tenantDir), "utf8").trim()).toBe("2026-09-21");

    const listing = execFileSync("tar", ["-tzf", snap.archivePath], { encoding: "utf8" });
    expect(listing).toContain("acme/data/keep.txt");
    expect(listing).not.toContain("aia-runs");
    expect(listing).not.toContain("node_modules");

    expect(() =>
      restoreTenantBackup({
        archivePath: snap.archivePath,
        intoDir: tenantDir,
        liveTenantDir: tenantDir,
      }),
    ).toThrow(/正本/);
    expect(readFileSync(join(tenantDir, "data", "keep.txt"), "utf8")).toBe("ledger");

    const occupied = join(root, "occupied");
    mkdirSync(occupied);
    writeFileSync(join(occupied, "already.txt"), "keep");
    expect(() =>
      restoreTenantBackup({
        archivePath: snap.archivePath,
        intoDir: occupied,
        liveTenantDir: tenantDir,
      }),
    ).toThrow(/空ではありません/);

    const into = join(root, "restore");
    const restored = restoreTenantBackup({
      archivePath: snap.archivePath,
      intoDir: into,
      liveTenantDir: tenantDir,
    });
    expect(readFileSync(join(restored.extractedTo, "acme", "data", "keep.txt"), "utf8")).toBe(
      "ledger",
    );
    expect(existsSync(join(restored.extractedTo, "acme", "scratch", "aia-runs"))).toBe(false);
  });

  it("does not stamp when the destination parent is missing", () => {
    const root = tempRoot();
    const tenantDir = join(root, "acme");
    mkdirSync(join(tenantDir, "data"), { recursive: true });
    writeFileSync(join(tenantDir, "data", "keep.txt"), "ledger");
    writeTarget(tenantDir, join(root, "missing-volume", "restore"));
    expect(() =>
      snapshotTenantBackup({ tenantDir, tenantId: "acme", now: new Date("2026-09-21T12:00:00") }),
    ).toThrow(/親ディレクトリ/);
    expect(existsSync(tenantBackupStampPath(tenantDir))).toBe(false);
  });
});

describe("tenant git remote", () => {
  it("allows a NAS file or ssh remote and refuses public forges", () => {
    expect(classifyTenantGitRemote("file:///Volumes/OrgNAS/git/acme.git").classification).toBe(
      "nas",
    );
    expect(classifyTenantGitRemote("ssh://git@nas.local/acme.git").classification).toBe("nas");
    expect(classifyTenantGitRemote("git@nas.local:acme.git").classification).toBe("nas");
    expect(classifyTenantGitRemote("git@github.com:org/acme.git").classification).toBe(
      "forbidden",
    );
    expect(classifyTenantGitRemote("https://github.com/org/acme.git").classification).toBe(
      "forbidden",
    );
    expect(classifyTenantGitRemote("https://gitlab.com/org/acme.git").classification).toBe(
      "forbidden",
    );
    expect(classifyTenantGitRemote("https://bitbucket.org/org/acme.git").classification).toBe(
      "forbidden",
    );
    expect(classifyTenantGitRemote("https://nas.local/acme.git").classification).toBe("unknown");
  });
});
