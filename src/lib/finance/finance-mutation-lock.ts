import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  lstatSync,
  renameSync,
  rmSync,
} from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { durableWrite, syncPath } from "./reconciliation-recovery-audit.js";

/** A synchronous, process-owned lock. Only authenticated recovery may reap a dead owner. */
export function withFinanceFileLock<T>(dir: string, fn: () => T, recoverDeadOwner = false): T {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, ".finance-mutation.lock");
  const token = `${randomUUID()}.json`;
  const preparing = join(dir, `.finance-owner-${token}`);
  mkdirSync(preparing, { mode: 0o700 });
  durableWrite(join(preparing, token), JSON.stringify({ pid: process.pid, host: hostname() }));
  syncPath(preparing);
  let acquired = false;
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        // Publish a complete nonempty owner directory atomically. Another
        // contender cannot replace it or mistake a live acquisition for empty.
        renameSync(preparing, lock);
        acquired = true;
        break;
      } catch (error) {
        if (
          !["EEXIST", "ENOTEMPTY", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")
        )
          throw error;
        if (recoverDeadOwner) reapDeadOwner(lock);
        const until = Date.now() + 25;
        while (Date.now() < until) {
          /* synchronous financial commands only */
        }
      }
    }
  } finally {
    if (!acquired) rmSync(preparing, { recursive: true, force: true });
  }
  if (!acquired)
    throw new Error("Finance mutation lock is held; recovery must not interrupt a live writer");
  const ownerPath = join(lock, token);
  try {
    return fn();
  } finally {
    releaseLock(lock, ownerPath);
  }
}

function releaseLock(lock: string, ownerPath: string): void {
  if (existsSync(ownerPath)) unlinkSync(ownerPath);
  try {
    rmdirSync(lock);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
}

function reapDeadOwner(lock: string): void {
  try {
    if (!lstatSync(lock).isDirectory())
      throw new Error(
        "Legacy finance lock has no verifiable owner; inspect the stopped process before recovery"
      );
    const names = readdirSync(lock);
    if (names.length === 0) {
      rmdirSync(lock);
      return;
    }
    if (names.length !== 1 || !/^[a-f0-9-]{36}\.json$/.test(names[0]!))
      throw new Error("Invalid finance lock owner record");
    const ownerPath = join(lock, names[0]!);
    const owner = JSON.parse(readFileSync(ownerPath, "utf8"));
    if (owner.host !== hostname() || !Number.isSafeInteger(owner.pid) || owner.pid <= 0)
      throw new Error("Finance lock owner cannot be verified on this host");
    try {
      process.kill(owner.pid, 0);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    // Never recursively remove a lock: only unlink this dead owner's token.
    unlinkSync(ownerPath);
    rmdirSync(lock);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
}
