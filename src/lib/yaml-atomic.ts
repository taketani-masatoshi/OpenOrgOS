import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";
import { wrapCanonicalWrite } from "./org/fs-guard/write-hook.js";

export class YamlFileBusyError extends Error {
  readonly code = "yaml_file_busy" as const;

  constructor(path: string) {
    super(`YAML file is busy: ${path}`);
    this.name = "YamlFileBusyError";
  }
}

/**
 * Write YAML via temp file + rename so readers never see a torn file.
 * (rename is atomic on the same filesystem.)
 */
export function writeYamlFileAtomic(path: string, data: unknown): void {
  wrapCanonicalWrite(path, () => {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, YAML.stringify(data), {
        encoding: "utf-8",
        mode: 0o600,
      });
      renameSync(temp, path);
    } catch (error) {
      try {
        if (existsSync(temp)) unlinkSync(temp);
      } catch {
        // best-effort cleanup
      }
      throw error;
    }
  });
}

function sleepMs(ms: number): void {
  const end = Date.now() + Math.max(0, ms);
  while (Date.now() < end) {
    // sync backoff for exclusive YAML locks (callers are sync)
  }
}

type LockOwner = { pid: number; token: string; created_at: string };

function readLockOwner(path: string): LockOwner | null {
  try {
    const value = JSON.parse(readFileSync(path, "utf-8")) as Partial<LockOwner>;
    return Number.isInteger(value.pid) && value.pid! > 0 && typeof value.token === "string"
      ? value as LockOwner
      : null;
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function unlinkOwnedLock(path: string, token: string): boolean {
  const current = readLockOwner(path);
  if (current?.token !== token) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

function unlinkExpiredMalformedLock(path: string, staleLockMs: number): boolean {
  if (readLockOwner(path)) return false;
  try {
    const before = statSync(path);
    if (staleLockMs > 0 && Date.now() - before.mtimeMs < staleLockMs) return false;
    const after = statSync(path);
    if (before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || readLockOwner(path)) return false;
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

function createLock(path: string): { fd: number; owner: LockOwner } {
  const fd = openSync(path, "wx", 0o600);
  const owner: LockOwner = {
    pid: process.pid,
    token: randomUUID(),
    created_at: new Date().toISOString(),
  };
  try {
    writeSync(fd, JSON.stringify(owner));
    return { fd, owner };
  } catch (error) {
    try { closeSync(fd); } catch { /* ignore */ }
    try { unlinkSync(path); } catch { /* ignore */ }
    throw error;
  }
}

/** Serialize dead-owner recovery so two contenders cannot delete a newly acquired lock. */
function recoverDeadLock(lockPath: string, recoveryPath: string, staleLockMs: number): void {
  let recovery: { fd: number; owner: LockOwner };
  try {
    recovery = createLock(recoveryPath);
  } catch {
    return;
  }
  try {
    const stale = readLockOwner(lockPath);
    if (stale && !processIsAlive(stale.pid)) unlinkOwnedLock(lockPath, stale.token);
    else if (!stale) unlinkExpiredMalformedLock(lockPath, staleLockMs);
  } finally {
    try { closeSync(recovery.fd); } catch { /* ignore */ }
    unlinkOwnedLock(recoveryPath, recovery.owner.token);
  }
}

/**
 * Exclusive lock around a YAML critical section (assert → mutate → save).
 * Uses O_EXCL lockfile; retries briefly so concurrent UI/API calls serialize.
 */
export function withYamlFileLock<T>(
  path: string,
  fn: () => T,
  options?: { retries?: number; retryDelayMs?: number; staleLockMs?: number },
): T {
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const recoveryPath = `${path}.recovery.lock`;
  const retries = options?.retries ?? 40;
  const retryDelayMs = options?.retryDelayMs ?? 25;
  const staleLockMs = options?.staleLockMs ?? 5 * 60_000;
  let acquired: { fd: number; owner: LockOwner } | undefined;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (existsSync(recoveryPath)) {
      const recoveryOwner = readLockOwner(recoveryPath);
      if (recoveryOwner && !processIsAlive(recoveryOwner.pid)) {
        unlinkOwnedLock(recoveryPath, recoveryOwner.token);
      } else if (!recoveryOwner) {
        unlinkExpiredMalformedLock(recoveryPath, staleLockMs);
      }
      if (attempt === retries) throw new YamlFileBusyError(path);
      sleepMs(retryDelayMs);
      continue;
    }
    try {
      acquired = createLock(lockPath);
      break;
    } catch {
      recoverDeadLock(lockPath, recoveryPath, staleLockMs);
      if (attempt === retries) throw new YamlFileBusyError(path);
      sleepMs(retryDelayMs);
    }
  }
  if (!acquired) throw new YamlFileBusyError(path);
  try {
    return fn();
  } finally {
    try {
      closeSync(acquired.fd);
    } catch {
      // ignore
    }
    try {
      unlinkOwnedLock(lockPath, acquired.owner.token);
    } catch {
      // ignore
    }
  }
}
