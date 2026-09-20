import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyTenantGitRemote,
  fileUrlForLocalPath,
} from "../src/lib/tenant-git-remote.js";
import {
  checkTenantBackupForWeekly,
  collectTenantBackupIntegrityIssues,
  restoreTenantBackup,
  snapshotTenantBackup,
  tenantBackupRetryHint,
  tenantBackupStampPath,
  type VolumeEncryption,
} from "../src/lib/tenant-backup.js";
import {
  runTenantBackupRestore,
  runTenantBackupSnapshot,
  runTenantBackupStatus,
  runTenantGitRemoteCheck,
} from "../src/commands/tenant-backup.js";
import {
  HA_APPR_ID,
  HA_APPR_KEY,
  HA_CEO_ID,
  HA_CEO_KEY,
  HA_OP_ID,
  HA_OP_KEY,
  setupTempCompanyEventsTenant,
} from "./helpers/temp-company-events-tenant.js";
import { setTenantId } from "../src/lib/tenant.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";

const roots: string[] = [];
const quiet = { volumeProbe: (): VolumeEncryption => "unknown" };

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
    expect(check.kind).toBe("ok_unconfigured");
    expect(check.message).toContain("未設定");
    expect(tenantBackupRetryHint(check.kind)).toBeNull();
    expect(collectTenantBackupIntegrityIssues(tenantDir)).toEqual([]);
  });

  it("warns on integrity only when a backup target is configured and unhealthy", () => {
    const root = tempRoot();
    const tenantDir = join(root, "demo");
    const nas = join(root, "nas");
    mkdirSync(join(tenantDir, "data"), { recursive: true });
    writeTarget(tenantDir, nas);
    const issues = collectTenantBackupIntegrityIssues(tenantDir);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("warning");
    expect(issues[0]?.file).toBe("data/org/backup-target.yaml");
    expect(tenantBackupRetryHint("stamp_missing")).toBe("orgos tenant backup snapshot");
    expect(tenantBackupRetryHint("forbidden_remote")).toBe("orgos tenant git-remote check");
  });

  it("fails weekly for a date-only stamp, a stale stamp, or a public git remote", () => {
    const root = tempRoot();
    const tenantDir = join(root, "demo");
    const nas = join(root, "nas");
    mkdirSync(join(tenantDir, "data"), { recursive: true });
    writeFileSync(join(tenantDir, "data", "keep.txt"), "ledger");
    writeTarget(tenantDir, nas);
    const missing = checkTenantBackupForWeekly(tenantDir, new Date("2026-09-21T12:00:00"));
    expect(missing.ok).toBe(false);
    expect(missing.kind).toBe("stamp_missing");

    mkdirSync(join(tenantDir, "scratch"), { recursive: true });
    writeFileSync(tenantBackupStampPath(tenantDir), "2026-09-01\n");
    const dateOnly = checkTenantBackupForWeekly(tenantDir, new Date("2026-09-21T12:00:00"));
    expect(dateOnly.ok).toBe(false);
    expect(dateOnly.kind).toBe("stamp_missing");
    expect(dateOnly.message).toContain("日付だけ");

    const snap = snapshotTenantBackup({
      tenantDir,
      tenantId: "demo",
      now: new Date("2026-09-21T12:00:00"),
      ...quiet,
    });
    const stamped = readFileSync(tenantBackupStampPath(tenantDir), "utf8").replace(
      "stamped_at: 2026-09-21",
      "stamped_at: 2026-09-01",
    );
    writeFileSync(tenantBackupStampPath(tenantDir), stamped);
    const stale = checkTenantBackupForWeekly(tenantDir, new Date("2026-09-21T12:00:00"));
    expect(stale.ok).toBe(false);
    expect(stale.kind).toBe("stamp_stale");
    expect(stale.message).toContain("7 日");
    expect(existsSync(snap.archivePath)).toBe(true);

    writeFileSync(
      join(tenantDir, "data", "org", "backup-target.yaml"),
      `version: 1\ndestination: ${nas}\nvolume_encrypted: true\ngit_remote: git@github.com:org/demo.git\n`,
    );
    const remote = checkTenantBackupForWeekly(tenantDir, new Date("2026-09-21T12:00:00"));
    expect(remote.ok).toBe(false);
    expect(remote.kind).toBe("forbidden_remote");
    expect(remote.message).toContain("github.com");
  });

  it("refuses snapshot when the tenant directory itself tracks a public forge", () => {
    const root = tempRoot();
    const tenantDir = join(root, "acme");
    const nas = join(root, "nas");
    mkdirSync(join(tenantDir, "data"), { recursive: true });
    writeFileSync(join(tenantDir, "data", "keep.txt"), "ledger");
    writeTarget(tenantDir, nas);
    execFileSync("git", ["init"], { cwd: tenantDir });
    execFileSync("git", ["remote", "add", "origin", "git@github.com:org/acme.git"], {
      cwd: tenantDir,
    });

    expect(() =>
      snapshotTenantBackup({ tenantDir, tenantId: "acme", ...quiet }),
    ).toThrow(/github\.com/);
    expect(existsSync(tenantBackupStampPath(tenantDir))).toBe(false);
    const weekly = checkTenantBackupForWeekly(tenantDir);
    expect(weekly.ok).toBe(false);
    expect(weekly.kind).toBe("forbidden_remote");
    expect(weekly.message).toContain("github.com");
  });

  it("git-remote check refuses a tenant .git origin on a public forge without yaml", () => {
    const root = tempRoot();
    const workspace = join(root, "ws");
    const tenantDir = join(workspace, "tenants", "acme");
    mkdirSync(join(tenantDir, "data"), { recursive: true });
    writeFileSync(
      join(tenantDir, "tenant.yaml"),
      "id: acme\nname: Acme\nlifecycle: test\noperation_mode: development\n",
    );
    writeFileSync(join(tenantDir, "data", "keep.txt"), "ledger");
    execFileSync("git", ["init"], { cwd: tenantDir });
    execFileSync("git", ["remote", "add", "origin", "git@github.com:org/acme.git"], {
      cwd: tenantDir,
    });

    const prevWorkspace = process.env.ORGOS_WORKSPACE;
    const prevTenant = process.env.ORGOS_TENANT;
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_TENANT = "acme";
    refreshOrgOsPaths();
    setTenantId("acme");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => runTenantGitRemoteCheck()).toThrow("process.exit");
    expect(err.mock.calls.map((c) => String(c[0])).join("\n")).toContain("github.com");
    exitSpy.mockRestore();
    err.mockRestore();

    if (prevWorkspace === undefined) delete process.env.ORGOS_WORKSPACE;
    else process.env.ORGOS_WORKSPACE = prevWorkspace;
    if (prevTenant === undefined) delete process.env.ORGOS_TENANT;
    else process.env.ORGOS_TENANT = prevTenant;
    refreshOrgOsPaths();
    setTenantId(prevTenant?.trim() || "mal");
  });

  it("snapshots without in-flight drafts and stamps only after tar succeeds", () => {
    const root = tempRoot();
    const tenantDir = join(root, "acme");
    const nas = join(root, "nas");
    mkdirSync(join(tenantDir, "data"), { recursive: true });
    mkdirSync(join(tenantDir, "scratch", "aia-runs"), { recursive: true });
    mkdirSync(join(tenantDir, "data", "scratch", "aia-runs"), { recursive: true });
    mkdirSync(join(tenantDir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(tenantDir, "data", "keep.txt"), "ledger");
    writeFileSync(join(tenantDir, "scratch", "aia-runs", "draft.txt"), "in-flight");
    writeFileSync(join(tenantDir, "data", "scratch", "aia-runs", "live.txt"), "live-draft");
    writeFileSync(join(tenantDir, "node_modules", "pkg", "index.js"), "skip");
    execFileSync("git", ["init"], { cwd: tenantDir });
    writeTarget(tenantDir, join(tenantDir, "inside"));

    expect(() =>
      snapshotTenantBackup({
        tenantDir,
        tenantId: "acme",
        now: new Date("2026-09-21T15:04:05"),
        ...quiet,
      }),
    ).toThrow(/外/);
    expect(existsSync(tenantBackupStampPath(tenantDir))).toBe(false);

    writeTarget(tenantDir, nas);
    const now = new Date("2026-09-21T15:04:05.123");
    const snap = snapshotTenantBackup({ tenantDir, tenantId: "acme", now, ...quiet });
    const again = snapshotTenantBackup({ tenantDir, tenantId: "acme", now, ...quiet });
    expect(snap.archivePath).not.toBe(again.archivePath);
    expect(existsSync(snap.archivePath)).toBe(true);
    expect(existsSync(again.archivePath)).toBe(true);
    expect(statSync(snap.archivePath).mode & 0o777).toBe(0o600);
    expect(statSync(nas).mode & 0o777).toBe(0o700);
    const stamp = readFileSync(tenantBackupStampPath(tenantDir), "utf8");
    expect(stamp).toContain("stamped_at: 2026-09-21");
    expect(stamp).toContain("encryption: declared");
    expect(stamp).toContain(`archive: ${again.archivePath}`);
    expect(existsSync(`${snap.archivePath}.partial`)).toBe(false);

    const listing = execFileSync("tar", ["-tzf", snap.archivePath], { encoding: "utf8" });
    expect(listing).toContain("acme/data/keep.txt");
    expect(listing).toContain(".git/");
    expect(listing).not.toContain("aia-runs");
    expect(listing).not.toContain("live.txt");
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
      snapshotTenantBackup({
        tenantDir,
        tenantId: "acme",
        now: new Date("2026-09-21T12:00:00"),
        ...quiet,
      }),
    ).toThrow(/親ディレクトリ/);
    expect(existsSync(tenantBackupStampPath(tenantDir))).toBe(false);
  });

  it("refuses a volume that reports itself unencrypted and records a verified volume", () => {
    const root = tempRoot();
    const tenantDir = join(root, "acme");
    const nas = join(root, "nas");
    mkdirSync(join(tenantDir, "data"), { recursive: true });
    writeFileSync(join(tenantDir, "data", "keep.txt"), "ledger");
    writeTarget(tenantDir, nas);
    expect(() =>
      snapshotTenantBackup({
        tenantDir,
        tenantId: "acme",
        now: new Date("2026-09-21T12:00:00"),
        volumeProbe: () => "unencrypted",
      }),
    ).toThrow(/暗号化されていない/);
    expect(existsSync(nas)).toBe(false);
    expect(existsSync(tenantBackupStampPath(tenantDir))).toBe(false);

    const snap = snapshotTenantBackup({
      tenantDir,
      tenantId: "acme",
      now: new Date("2026-09-21T12:00:01"),
      volumeProbe: () => "encrypted",
    });
    expect(snap.encryption).toBe("verified");
    expect(readFileSync(tenantBackupStampPath(tenantDir), "utf8")).toContain("encryption: verified");
  });

  it("does not extract an archive that contains a parent segment", () => {
    const root = tempRoot();
    const tenantDir = join(root, "live");
    const into = join(root, "restore");
    const archive = join(root, "escape.tar.gz");
    mkdirSync(tenantDir, { recursive: true });
    execFileSync(
      "python3",
      [
        "-c",
        [
          "import tarfile, io, os",
          "path, outside = os.environ['ARCHIVE'], os.environ['OUTSIDE']",
          "os.makedirs(outside, exist_ok=True)",
          "with tarfile.open(path, 'w:gz') as tf:",
          "    data = b'pwned\\n'",
          "    info = tarfile.TarInfo(name='../outside/pwned.txt')",
          "    info.size = len(data)",
          "    tf.addfile(info, io.BytesIO(data))",
          "    ok = b'ok\\n'",
          "    info2 = tarfile.TarInfo(name='ok/note.txt')",
          "    info2.size = len(ok)",
          "    tf.addfile(info2, io.BytesIO(ok))",
        ].join("\n"),
      ],
      { env: { ...process.env, ARCHIVE: archive, OUTSIDE: join(root, "outside") } },
    );
    expect(() =>
      restoreTenantBackup({
        archivePath: archive,
        intoDir: into,
        liveTenantDir: tenantDir,
      }),
    ).toThrow(/展開しません|メンバーを読めません/);
    expect(existsSync(into)).toBe(false);
    expect(existsSync(join(root, "outside", "pwned.txt"))).toBe(false);
    expect(existsSync(`${into}.partial-${process.pid}`)).toBe(false);
  });
});

describe("tenant git remote", () => {
  it("refuses public forge aliases and allows a private https host", () => {
    for (const url of [
      "ssh://git@ssh.github.com/org/tenant.git",
      "git@ssh.github.com:org/tenant.git",
      "git@github.com.:org/tenant.git",
      "ssh://git@github.com./org/tenant.git",
      "git@ssh.gitlab.com:org/tenant.git",
      "git@altssh.bitbucket.org:org/tenant.git",
      "git@github.com:org/acme.git",
      "https://github.com/org/acme.git",
    ]) {
      expect(classifyTenantGitRemote(url).classification, url).toBe("forbidden");
    }
    expect(classifyTenantGitRemote("https://nas.local/acme.git").classification).toBe("nas");
    expect(classifyTenantGitRemote("ssh://git@nas.local/acme.git").classification).toBe("nas");
    expect(classifyTenantGitRemote("git@nas.local:acme.git").classification).toBe("nas");
  });

  it("inspects remotes inside a reachable file URL and leaves a missing path unverified", () => {
    const root = tempRoot();
    const missing = classifyTenantGitRemote("file:///Volumes/OrgNAS/git/acme.git");
    expect(missing.classification).toBe("unverified");

    const bare = join(root, "local.git");
    mkdirSync(bare);
    expect(classifyTenantGitRemote(fileUrlForLocalPath(bare)).classification).toBe("nas");

    const repo = join(root, "clone");
    execFileSync("git", ["init", repo]);
    execFileSync("git", ["-C", repo, "remote", "add", "origin", "git@github.com:org/acme.git"]);
    expect(classifyTenantGitRemote(fileUrlForLocalPath(repo)).classification).toBe("forbidden");

    const tenantDir = join(root, "demo");
    const nas = join(root, "nas");
    mkdirSync(join(tenantDir, "data"), { recursive: true });
    writeFileSync(join(tenantDir, "data", "keep.txt"), "ledger");
    writeTarget(tenantDir, nas, "git_remote: file:///Volumes/OrgNAS/git/missing.git\n");
    snapshotTenantBackup({
      tenantDir,
      tenantId: "demo",
      now: new Date("2026-09-21T12:00:00"),
      volumeProbe: () => "unknown",
    });
    const weekly = checkTenantBackupForWeekly(tenantDir, new Date("2026-09-21T12:00:00"));
    expect(weekly.ok).toBe(true);
  });
});

describe("tenant backup CLI roles", () => {
  const env = { ...process.env };
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = setupTempCompanyEventsTenant().restore;
    process.env.STEWARD_OPERATOR_AUTH = "1";
    delete process.env.ORGOS_ENV;
    delete process.env.ORGOS_OPERATOR_KEY;
    delete process.env.ORGOS_CLI_OPERATOR_ID;
  });

  afterEach(() => {
    process.env = { ...env };
    restore?.();
  });

  function deniedMessage(): string {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      runTenantBackupSnapshot();
    } catch (e) {
      expect((e as Error).message).toBe("process.exit");
    }
    exitSpy.mockRestore();
    const text = err.mock.calls.map((c) => String(c[0])).join("\n");
    err.mockRestore();
    return text;
  }

  it("lets status run without an operator", () => {
    expect(() => runTenantBackupStatus()).not.toThrow();
  });

  it("refuses snapshot and restore for an operator who is not ceo or approver", () => {
    process.env.ORGOS_CLI_OPERATOR_ID = HA_OP_ID;
    process.env.ORGOS_OPERATOR_KEY = HA_OP_KEY;
    expect(deniedMessage()).toMatch(/lacks permission|ceo or approver/);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      runTenantBackupRestore({ archive: "/tmp/none.tar.gz", into: "/tmp/empty-restore" }),
    ).toThrow("process.exit");
    expect(err.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(
      /lacks permission|ceo or approver/,
    );
    exitSpy.mockRestore();
    err.mockRestore();
  });

  it("lets a ceo reach snapshot, which then stops on a missing target", () => {
    process.env.ORGOS_CLI_OPERATOR_ID = HA_CEO_ID;
    process.env.ORGOS_OPERATOR_KEY = HA_CEO_KEY;
    expect(deniedMessage()).toContain("退避先が未設定");
  });

  it("lets an approver reach snapshot, which then stops on a missing target", () => {
    process.env.ORGOS_CLI_OPERATOR_ID = HA_APPR_ID;
    process.env.ORGOS_OPERATOR_KEY = HA_APPR_KEY;
    expect(deniedMessage()).toContain("退避先が未設定");
  });
});
