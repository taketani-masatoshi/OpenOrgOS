/**
 * NAS restore copy of one tenant directory.
 * The Mac tenant stays the working canonical. This archive is a restore copy
 * on a volume the operator already encrypted — the tool does not invent keys.
 * In-flight AIA drafts (scratch/aia-runs) are left out. The stamp is written
 * only after tar succeeds.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync as writeScratchStamp,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";

export const TENANT_BACKUP_MAX_AGE_DAYS = 7;
export const TENANT_BACKUP_STAMP_FILE = "tenant-backup-last.txt";

const ARCHIVE_EXCLUDES = ["scratch/aia-runs", "node_modules"] as const;

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
  return `${formatDay(now).replace(/-/g, "")}T${hh}${mm}${ss}`;
}

export function tenantBackupStampAgeDays(tenantDir: string, now = new Date()): number | null {
  const path = tenantBackupStampPath(tenantDir);
  if (!existsSync(path)) return null;
  const day = readFileSync(path, "utf8").trim().slice(0, 10);
  const lastMs = Date.parse(`${day}T12:00:00`);
  if (Number.isNaN(lastMs)) return null;
  return Math.floor((now.getTime() - lastMs) / 86_400_000);
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

export function snapshotTenantBackup(opts: {
  tenantDir: string;
  tenantId: string;
  now?: Date;
}): { archivePath: string; stampedAt: string } {
  const now = opts.now ?? new Date();
  const tenantDir = canonicalPath(opts.tenantDir);
  if (!existsSync(tenantDir) || !statSync(tenantDir).isDirectory()) {
    throw new Error(`テナントディレクトリがありません: ${opts.tenantDir}`);
  }
  const target = requireReadyTarget(tenantDir);
  const destination = canonicalPath(target.destination);
  if (sameOrInside(tenantDir, destination) || sameOrInside(destination, tenantDir)) {
    throw new Error("退避先はテナントディレクトリの外にしてください");
  }
  const parent = dirname(destination);
  if (!existsSync(parent)) {
    throw new Error(`退避先の親ディレクトリがありません（マウントを確認してください）: ${parent}`);
  }
  mkdirSync(destination, { recursive: true });

  const folderName = basename(tenantDir);
  const archivePath = join(destination, `${opts.tenantId}-${compactStamp(now)}.tar.gz`);
  const args = [
    "-czf",
    archivePath,
    ...ARCHIVE_EXCLUDES.flatMap((rel) => ["--exclude", `${folderName}/${rel}`]),
    "-C",
    dirname(tenantDir),
    folderName,
  ];
  const tar = spawnSync("tar", args, { encoding: "utf8" });
  if (tar.status !== 0 || !existsSync(archivePath) || statSync(archivePath).size === 0) {
    throw new Error(`テナントの退避に失敗しました: ${tar.stderr?.trim() || "tar exited non-zero"}`);
  }

  const stampedAt = formatDay(now);
  const stampPath = tenantBackupStampPath(tenantDir);
  mkdirSync(dirname(stampPath), { recursive: true });
  writeScratchStamp(stampPath, `${stampedAt}\n`);
  return { archivePath, stampedAt };
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
  mkdirSync(into, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", opts.archivePath, "-C", into], { encoding: "utf8" });
  if (tar.status !== 0) {
    throw new Error(`復元に失敗しました: ${tar.stderr?.trim() || "tar exited non-zero"}`);
  }
  return { extractedTo: into };
}

export function checkTenantBackupForWeekly(
  tenantDir: string,
  now = new Date(),
): { ok: boolean; message: string } {
  const loaded = loadBackupTarget(tenantDir);
  if (loaded.state === "missing") {
    return {
      ok: true,
      message: "テナント退避先が未設定 — NAS スナップショットは任意（data/org/backup-target.yaml）",
    };
  }
  if (loaded.state === "invalid") {
    return { ok: false, message: loaded.message };
  }
  const age = tenantBackupStampAgeDays(tenantDir, now);
  if (age === null) {
    return {
      ok: false,
      message: "テナント退避先は設定済みだがスタンプがありません — orgos tenant backup snapshot",
    };
  }
  if (age > TENANT_BACKUP_MAX_AGE_DAYS) {
    return {
      ok: false,
      message: `テナント退避が ${age} 日前 — 7 日を超えています（orgos tenant backup snapshot）`,
    };
  }
  return { ok: true, message: `テナント退避 OK（${age} 日前）` };
}
