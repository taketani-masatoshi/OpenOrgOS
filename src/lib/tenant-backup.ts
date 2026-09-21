/**
 * NAS restore copy of one tenant directory.
 * The Mac tenant stays the working canonical. This archive is a restore copy
 * on a volume the operator already encrypted — the tool does not invent keys.
 * In-flight AIA drafts (scratch/aia-runs) are left out. The stamp is written
 * only after the archive is in place, mode 0600, and hashed.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync as renameIntoPlace,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync as writeScratchStamp,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { classifyRepoRemotes, classifyTenantGitRemote } from "./tenant-git-remote.js";

export const TENANT_BACKUP_MAX_AGE_DAYS = 7;
export const TENANT_BACKUP_STAMP_FILE = "tenant-backup-last.txt";

const ARCHIVE_EXCLUDES = ["scratch/aia-runs", "data/scratch/aia-runs", "node_modules"] as const;

export const backupTargetSchema = z.object({
  version: z.literal(1),
  destination: z.string().min(1),
  volume_encrypted: z.literal(true),
  git_remote: z.string().min(1).optional(),
});

export type BackupTarget = z.infer<typeof backupTargetSchema>;

export type BackupTargetLoad =
  | { state: "missing" }
  | { state: "invalid"; message: string }
  | { state: "ready"; target: BackupTarget };

export type VolumeEncryption = "encrypted" | "unencrypted" | "unknown";

export type TenantBackupStamp = {
  stamped_at: string;
  archive: string;
  bytes: number;
  sha256: string;
  encryption: "declared" | "verified";
};

export function backupTargetPath(tenantDir: string): string {
  return join(tenantDir, "data", "org", "backup-target.yaml");
}

export function tenantBackupStampPath(tenantDir: string): string {
  return join(tenantDir, "scratch", TENANT_BACKUP_STAMP_FILE);
}

export function loadBackupTarget(tenantDir: string): BackupTargetLoad {
  const path = backupTargetPath(tenantDir);
  if (!existsSync(path)) return { state: "missing" };
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(path, "utf8"));
  } catch {
    return { state: "invalid", message: "backup-target.yaml を読めません" };
  }
  const result = backupTargetSchema.safeParse(parsed);
  if (!result.success) {
    return {
      state: "invalid",
      message:
        "backup-target.yaml が契約と違います（version: 1、絶対パスの destination、volume_encrypted: true）",
    };
  }
  if (!isAbsolute(result.data.destination)) {
    return { state: "invalid", message: "退避先 destination は絶対パスにしてください" };
  }
  return { state: "ready", target: result.data };
}

function canonicalPath(p: string): string {
  const abs = resolve(p).replace(/\/+$/, "");
  if (existsSync(abs)) return realpathSync(abs);
  const tail: string[] = [];
  let cursor = abs;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return abs;
    tail.unshift(basename(cursor));
    cursor = parent;
  }
  return join(realpathSync(cursor), ...tail);
}

function sameOrInside(parent: string, child: string): boolean {
  const rel = relative(canonicalPath(parent), canonicalPath(child));
  return rel === "" || (rel !== "" && !rel.startsWith("..") && !isAbsolute(rel));
}

function formatDay(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function compactStamp(now: Date): string {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${formatDay(now).replace(/-/g, "")}T${hh}${mm}${ss}${ms}`;
}

function sha256File(path: string): string {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let n = 0;
    while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, n));
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

export function formatTenantBackupStamp(stamp: TenantBackupStamp): string {
  return [
    `stamped_at: ${stamp.stamped_at}`,
    `archive: ${stamp.archive}`,
    `bytes: ${stamp.bytes}`,
    `sha256: ${stamp.sha256}`,
    `encryption: ${stamp.encryption}`,
    "",
  ].join("\n");
}

export function readTenantBackupStamp(tenantDir: string): TenantBackupStamp | null {
  const path = tenantBackupStampPath(tenantDir);
  if (!existsSync(path)) return null;
  const fields = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const idx = line.indexOf(": ");
    if (idx <= 0) continue;
    fields.set(line.slice(0, idx), line.slice(idx + 2).trim());
  }
  const stampedAt = fields.get("stamped_at") ?? "";
  const archive = fields.get("archive") ?? "";
  const bytes = Number(fields.get("bytes"));
  const sha256 = fields.get("sha256") ?? "";
  const encryption = fields.get("encryption");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stampedAt)) return null;
  if (!archive || !Number.isFinite(bytes) || !/^[a-f0-9]{64}$/.test(sha256)) return null;
  if (encryption !== "declared" && encryption !== "verified") return null;
  return { stamped_at: stampedAt, archive, bytes, sha256, encryption };
}

function stampAgeDays(stamp: TenantBackupStamp, now: Date): number | null {
  const lastMs = Date.parse(`${stamp.stamped_at}T12:00:00`);
  if (Number.isNaN(lastMs)) return null;
  return Math.floor((now.getTime() - lastMs) / 86_400_000);
}

export function probeVolumeEncryption(destination: string): VolumeEncryption {
  if (process.platform !== "darwin") return "unknown";
  const probe = spawnSync("diskutil", ["info", destination], { encoding: "utf8" });
  if (probe.status !== 0 || !probe.stdout) return "unknown";
  if (/^\s*Encrypted:\s+Yes\s*$/im.test(probe.stdout)) return "encrypted";
  if (/^\s*FileVault:\s+Yes\s*$/im.test(probe.stdout)) return "encrypted";
  if (/^\s*Encrypted:\s+No\s*$/im.test(probe.stdout)) return "unencrypted";
  return "unknown";
}

function requireReadyTarget(tenantDir: string): BackupTarget {
  const loaded = loadBackupTarget(tenantDir);
  if (loaded.state === "missing") {
    throw new Error(
      "退避先が未設定です。data/org/backup-target.yaml を backup-target.yaml.example から作ってください",
    );
  }
  if (loaded.state === "invalid") throw new Error(loaded.message);
  return loaded.target;
}

function safeTenantId(tenantId: string): string {
  const cleaned = tenantId.replace(/[^A-Za-z0-9._-]+/g, "_");
  return cleaned || "tenant";
}

function uniqueArchivePath(destination: string, tenantId: string, now: Date): string {
  const base = `${safeTenantId(tenantId)}-${compactStamp(now)}`;
  let path = join(destination, `${base}.tar.gz`);
  let n = 2;
  while (existsSync(path)) {
    path = join(destination, `${base}-${n}.tar.gz`);
    n += 1;
  }
  return path;
}

export function snapshotTenantBackup(opts: {
  tenantDir: string;
  tenantId: string;
  now?: Date;
  volumeProbe?: (destination: string) => VolumeEncryption;
}): { archivePath: string; stampedAt: string; encryption: "declared" | "verified" } {
  const now = opts.now ?? new Date();
  const tenantDir = canonicalPath(opts.tenantDir);
  if (!existsSync(tenantDir) || !statSync(tenantDir).isDirectory()) {
    throw new Error(`テナントディレクトリがありません: ${opts.tenantDir}`);
  }
  const target = requireReadyTarget(tenantDir);
  const localGit = classifyRepoRemotes(tenantDir);
  if (localGit.state === "forbidden") {
    throw new Error(localGit.verdict.message);
  }
  const destination = canonicalPath(target.destination);
  if (sameOrInside(tenantDir, destination) || sameOrInside(destination, tenantDir)) {
    throw new Error("退避先はテナントディレクトリの外にしてください");
  }
  const parent = dirname(destination);
  if (!existsSync(parent)) {
    throw new Error(`退避先の親ディレクトリがありません（マウントを確認してください）: ${parent}`);
  }
  const probed = (opts.volumeProbe ?? probeVolumeEncryption)(destination);
  if (probed === "unencrypted") {
    throw new Error(
      "退避先のボリュームは暗号化されていないと読めます。暗号化された NAS を指定してください",
    );
  }
  const createdDest = !existsSync(destination);
  if (createdDest) mkdirSync(destination, { mode: 0o700 });

  const folderName = basename(tenantDir);
  const archivePath = uniqueArchivePath(destination, opts.tenantId, now);
  const tempPath = `${archivePath}.partial`;
  const args = [
    "-czf",
    tempPath,
    ...ARCHIVE_EXCLUDES.flatMap((rel) => ["--exclude", `${folderName}/${rel}`]),
    "-C",
    dirname(tenantDir),
    folderName,
  ];
  try {
    const tar = spawnSync("tar", args, { encoding: "utf8" });
    if (tar.status !== 0 || !existsSync(tempPath) || statSync(tempPath).size === 0) {
      throw new Error(`テナントの退避に失敗しました: ${tar.stderr?.trim() || "tar exited non-zero"}`);
    }
    chmodSync(tempPath, 0o600);
    renameIntoPlace(tempPath, archivePath);
  } catch (err) {
    if (existsSync(tempPath)) unlinkSync(tempPath);
    throw err;
  }

  const stampedAt = formatDay(now);
  const encryption = probed === "encrypted" ? "verified" : "declared";
  const stamp: TenantBackupStamp = {
    stamped_at: stampedAt,
    archive: archivePath,
    bytes: statSync(archivePath).size,
    sha256: sha256File(archivePath),
    encryption,
  };
  const stampPath = tenantBackupStampPath(tenantDir);
  mkdirSync(dirname(stampPath), { recursive: true });
  writeScratchStamp(stampPath, formatTenantBackupStamp(stamp));
  return { archivePath, stampedAt, encryption };
}

function archiveMemberUnsafe(name: string): boolean {
  if (!name || name.includes("\0")) return true;
  if (name.startsWith("/") || name.startsWith("\\")) return true;
  return name.split("/").some((part) => part === "..");
}

function assertArchiveMembersSafe(archivePath: string): void {
  const listed = spawnSync("tar", ["-tzf", archivePath], { encoding: "utf8" });
  const names = (listed.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (names.some(archiveMemberUnsafe)) {
    throw new Error("アーカイブに絶対パスまたは .. があるため展開しません");
  }
  if (listed.status !== 0 || names.length === 0) {
    throw new Error(`アーカイブのメンバーを読めません: ${listed.stderr?.trim() || "tar exited non-zero"}`);
  }
}

export function restoreTenantBackup(opts: {
  archivePath: string;
  intoDir: string;
  liveTenantDir: string;
}): { extractedTo: string } {
  if (!isAbsolute(opts.archivePath)) {
    throw new Error("アーカイブ --archive は絶対パスにしてください");
  }
  if (!isAbsolute(opts.intoDir)) {
    throw new Error("復元先 --into は絶対パスにしてください");
  }
  const live = canonicalPath(opts.liveTenantDir);
  const into = canonicalPath(opts.intoDir);
  if (sameOrInside(live, into) || sameOrInside(into, live)) {
    throw new Error("正本のテナントディレクトリへは復元しません。空の別ディレクトリを指定してください");
  }
  if (!existsSync(opts.archivePath) || !statSync(opts.archivePath).isFile()) {
    throw new Error(`アーカイブがありません: ${opts.archivePath}`);
  }
  if (existsSync(into) && readdirSync(into).length > 0) {
    throw new Error("復元先が空ではありません。上書きしません");
  }
  assertArchiveMembersSafe(opts.archivePath);

  const partial = `${into}.partial-${process.pid}-${Date.now()}`;
  mkdirSync(partial, { recursive: true });
  try {
    const tar = spawnSync("tar", ["-xzf", opts.archivePath, "-C", partial], { encoding: "utf8" });
    if (tar.status !== 0) {
      throw new Error(`復元に失敗しました: ${tar.stderr?.trim() || "tar exited non-zero"}`);
    }
    if (existsSync(into)) rmSync(into, { recursive: true, force: true });
    renameIntoPlace(partial, into);
  } catch (err) {
    rmSync(partial, { recursive: true, force: true });
    throw err;
  }
  return { extractedTo: into };
}

export function tenantBackupStampAgeDays(tenantDir: string, now = new Date()): number | null {
  const stamp = readTenantBackupStamp(tenantDir);
  if (!stamp) return null;
  return stampAgeDays(stamp, now);
}

export type TenantBackupCheckKind =
  | "ok_unconfigured"
  | "ok"
  | "invalid_config"
  | "forbidden_remote"
  | "stamp_missing"
  | "stamp_mismatch"
  | "stamp_stale";

export type TenantBackupWeeklyCheck = {
  ok: boolean;
  kind: TenantBackupCheckKind;
  message: string;
};

export function tenantBackupRetryHint(kind: TenantBackupCheckKind): string | null {
  if (kind === "ok" || kind === "ok_unconfigured") return null;
  if (kind === "forbidden_remote") return "orgos tenant git-remote check";
  return "orgos tenant backup snapshot";
}

/** Warning-only issues for validate. Empty when backup is unconfigured or healthy. */
export function collectTenantBackupIntegrityIssues(
  tenantDir: string,
  now = new Date(),
): Array<{ level: "warning"; file: string; message: string }> {
  const check = checkTenantBackupForWeekly(tenantDir, now);
  if (check.ok) return [];
  return [{ level: "warning", file: "data/org/backup-target.yaml", message: check.message }];
}

export function checkTenantBackupForWeekly(
  tenantDir: string,
  now = new Date(),
): TenantBackupWeeklyCheck {
  const loaded = loadBackupTarget(tenantDir);
  if (loaded.state === "missing") {
    return {
      ok: true,
      kind: "ok_unconfigured",
      message: "テナント退避先が未設定 — NAS スナップショットは任意（data/org/backup-target.yaml）",
    };
  }
  if (loaded.state === "invalid") {
    return { ok: false, kind: "invalid_config", message: loaded.message };
  }
  if (loaded.target.git_remote) {
    const remote = classifyTenantGitRemote(loaded.target.git_remote);
    if (remote.classification === "forbidden") {
      return { ok: false, kind: "forbidden_remote", message: remote.message };
    }
  }
  const localGit = classifyRepoRemotes(tenantDir);
  if (localGit.state === "forbidden") {
    return { ok: false, kind: "forbidden_remote", message: localGit.verdict.message };
  }
  const stamp = readTenantBackupStamp(tenantDir);
  if (!stamp) {
    return {
      ok: false,
      kind: "stamp_missing",
      message:
        "テナント退避のスタンプが無い、または日付だけです — orgos tenant backup snapshot",
    };
  }
  if (
    !existsSync(stamp.archive) ||
    statSync(stamp.archive).size !== stamp.bytes ||
    sha256File(stamp.archive) !== stamp.sha256
  ) {
    return {
      ok: false,
      kind: "stamp_mismatch",
      message: "テナント退避のスタンプとアーカイブが一致しません — orgos tenant backup snapshot",
    };
  }
  const age = stampAgeDays(stamp, now);
  if (age === null || age > TENANT_BACKUP_MAX_AGE_DAYS) {
    return {
      ok: false,
      kind: "stamp_stale",
      message: `テナント退避が ${age ?? "不明"} 日前 — 7 日を超えています（orgos tenant backup snapshot）`,
    };
  }
  const proof = stamp.encryption === "verified" ? "暗号化を確認" : "暗号化は宣言のみ";
  return {
    ok: true,
    kind: "ok",
    message: `テナント退避 OK（${age} 日前、${proof}）`,
  };
}
