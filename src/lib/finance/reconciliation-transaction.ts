import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getDataDir } from "../utils.js";
import { getTenantId } from "../tenant.js";
import { loadOperatorRegistryForTenant, verifyOperatorKey } from "../org/operators.js";
import {
  operatorHasPermission,
  requireOperatorPermission,
  resolveOperatorPermissions,
} from "../console-auth/operator-rbac.js";
import { getFsGuardAgent } from "../org/fs-guard/context.js";
import { wrapCanonicalWrite } from "../org/fs-guard/write-hook.js";
import { withFinanceFileLock } from "./finance-mutation-lock.js";
import { fsSync } from "./fs-sync.js";
import {
  appendRecoveryAudit,
  readRecoveryAudit,
  digest,
  durableWrite,
  syncPath,
} from "./reconciliation-recovery-audit.js";

const locks = new Set<string>();
const internalReads = new Set<string>();
const files = ["journal-entries.yaml", "reconciliation-events.yaml"];
type Preimage = { name: string; base64: string | null; sha256?: string | null };
function financeDir(): string {
  return join(getDataDir(), "finance");
}
export function reconciliationPendingPath(): string {
  return join(financeDir(), ".reconciliation-pending");
}

export function assertReconciliationReadable(): void {
  const pending = reconciliationPendingPath();
  if (
    (fsSync.existsSync(pending) ||
      fsSync.existsSync(join(financeDir(), ".reconciliation-recovery"))) &&
    !internalReads.has(pending)
  ) {
    throw new Error("Reconciliation transaction incomplete; ledger unavailable until recovery");
  }
}

function authorizeRecovery(options: RecoveryOptions): string {
  if (options.confirm !== true || !options.operatorId?.trim() || !options.reason?.trim()) {
    throw new Error(
      "Reconciliation recovery requires explicit confirm=true, operator ID and reason"
    );
  }
  // Always read the current registry and validate the key, including development
  // mode. Neither an arbitrary operator label nor the dev bypass is authority.
  const record = loadOperatorRegistryForTenant(getTenantId())?.operators.find(
    (op) => op.operator_id === options.operatorId
  );
  const key = options.operatorKey?.trim() || process.env.ORGOS_OPERATOR_KEY?.trim();
  if (!record || !key || !verifyOperatorKey(record.key_hash, key))
    throw new Error("Recovery requires a valid registered operator key");
  if (
    getFsGuardAgent() ||
    !["ceo", "approver"].includes(record.role) ||
    (record.guest_expires_at && !(Date.parse(record.guest_expires_at) > Date.now())) ||
    !operatorHasPermission(record, "finance:reconcile")
  ) {
    throw new Error("Recovery requires an active human finance approver");
  }
  requireOperatorPermission(
    { record, permissions: resolveOperatorPermissions(record) },
    "finance:reconcile"
  );
  return record.operator_id;
}

function parseBefore(pending: string): Preimage[] {
  const entries: unknown = JSON.parse(fsSync.readFileSync(join(pending, "before.json"), "utf8"));
  if (
    !Array.isArray(entries) ||
    entries.length !== files.length ||
    new Set(entries.map((e) => e?.name)).size !== files.length ||
    entries.some(
      (e) =>
        !e ||
        !files.includes(e.name) ||
        (e.base64 !== null &&
          (typeof e.base64 !== "string" ||
            Buffer.from(e.base64, "base64").toString("base64") !== e.base64 ||
            digest(Buffer.from(e.base64, "base64")) !== e.sha256))
    )
  ) {
    throw new Error("Reconciliation recovery record is invalid or hash mismatch");
  }
  return entries;
}

function fileHashes(dir: string): Record<string, string | null> {
  return Object.fromEntries(
    files.map((name) => [
      name,
      fsSync.existsSync(join(dir, name)) ? digest(fsSync.readFileSync(join(dir, name))) : null,
    ])
  );
}

function restore(dir: string, pending: string, entries: Preimage[]): void {
  for (const entry of entries) {
    const path = join(dir, entry.name);
    wrapCanonicalWrite(path, () => {
      if (entry.base64 === null) fsSync.rmSync(path, { force: true });
      else {
        const temp = join(pending, `${entry.name}.restore`);
        durableWrite(temp, Buffer.from(entry.base64, "base64"));
        fsSync.renameSync(temp, path);
      }
    });
  }
  syncPath(dir);
  const hashes = fileHashes(dir);
  if (entries.some((e) => hashes[e.name] !== (e.base64 === null ? null : e.sha256))) {
    throw new Error("Restored reconciliation does not match its preimage");
  }
}

function finish(dir: string, pending: string, retainEvidence = true): void {
  // Retain private evidence. Atomic rename cannot delete half a recovery record.
  fsSync.rmSync(join(dir, ".reconciliation-recovery"), { recursive: true, force: true });
  syncPath(dir);
  const finished = join(dir, `.reconciliation-finished-${randomUUID()}`);
  fsSync.renameSync(pending, finished);
  syncPath(dir);
  if (!retainEvidence) {
    // Once detached durably, this snapshot is no longer needed for recovery.
    // A cleanup failure only leaves private evidence, not an uncertain commit.
    try {
      fsSync.rmSync(finished, { recursive: true });
    } catch {
      /* preserved for maintenance */
    }
  }
}

type RecoveryOptions = {
  confirm?: boolean;
  operatorId?: string;
  operatorKey?: string;
  reason?: string;
};
export function recoverPendingReconciliation(options: RecoveryOptions = {}): {
  restored: string[];
  status: "none" | "restored" | "committed";
} {
  const operatorId = authorizeRecovery(options);
  const dir = financeDir();
  return withFinanceFileLock(
    dir,
    () => {
      const pending = reconciliationPendingPath();
      if (!fsSync.existsSync(pending)) {
        assertReconciliationReadable();
        return { restored: [], status: "none" };
      }
      const committed = join(pending, "commit.json");
      const mode = fsSync.existsSync(committed) ? "committed_cleanup" : "restore";
      const entries = parseBefore(pending);
      if (!fsSync.existsSync(join(pending, "transaction-id"))) {
        durableWrite(join(pending, "transaction-id"), randomUUID());
        syncPath(pending);
      }
      const transactionId = digest(
        fsSync.readFileSync(join(pending, "before.json")) +
          fsSync.readFileSync(join(pending, "transaction-id"), "utf8")
      );
      const input = {
        transaction_id: transactionId,
        attempt_id: randomUUID(),
        operator_id: operatorId,
        reason: options.reason!.trim(),
        mode,
      } as const;
      const previous = readRecoveryAudit(dir);
      appendRecoveryAudit(dir, { ...input, event: "started" });
      try {
        if (mode === "committed_cleanup") {
          const commit = JSON.parse(fsSync.readFileSync(committed, "utf8"));
          const hashes = fileHashes(dir);
          if (
            ![1, 2].includes(commit.version) ||
            !commit.hashes ||
            files.some(
              (name) =>
                hashes[name] !== commit.hashes[name] &&
                !(
                  commit.version === 1 &&
                  hashes[name] === null &&
                  commit.hashes[name] === digest("")
                )
            )
          ) {
            throw new Error("Committed reconciliation marker does not match ledger files");
          }
        } else restore(dir, pending, entries);
        if (!previous.some((e) => e.transaction_id === transactionId && e.event === "completed")) {
          appendRecoveryAudit(dir, { ...input, event: "completed" });
        }
        finish(dir, pending);
        return {
          restored: mode === "restore" ? files.slice() : [],
          status: mode === "restore" ? "restored" : "committed",
        };
      } catch (error) {
        appendRecoveryAudit(dir, { ...input, event: "failed" });
        throw error;
      }
    },
    true
  );
}

/** Shared synchronous lock for journal, reconciliation and period-lock mutations. */
export function withFinanceMutation<T>(fn: () => T): T {
  const dir = financeDir();
  if (locks.has(dir)) return fn();
  return withFinanceFileLock(dir, () => {
    assertReconciliationReadable();
    locks.add(dir);
    try {
      return fn();
    } finally {
      locks.delete(dir);
    }
  });
}

/** Readers fail closed until both ledgers and the commit decision are durable. */
export function withReconciliationTransaction<T>(fn: () => T): T {
  return withFinanceMutation(() => {
    const dir = financeDir();
    const pending = reconciliationPendingPath();
    const before: Preimage[] = files.map((name) => {
      const bytes = fsSync.existsSync(join(dir, name)) ? fsSync.readFileSync(join(dir, name)) : null;
      return {
        name,
        base64: bytes?.toString("base64") ?? null,
        sha256: bytes === null ? null : digest(bytes),
      };
    });
    const preparing = join(dir, `.reconciliation-preparing-${randomUUID()}`);
    fsSync.mkdirSync(preparing, { mode: 0o700 });
    durableWrite(join(preparing, "before.json"), JSON.stringify(before));
    durableWrite(join(preparing, "transaction-id"), randomUUID());
    syncPath(preparing);
    fsSync.renameSync(preparing, pending);
    syncPath(dir);
    internalReads.add(pending);
    let commitWritten = false;
    try {
      const result = fn();
      for (const name of files) if (fsSync.existsSync(join(dir, name))) syncPath(join(dir, name));
      syncPath(dir);
      durableWrite(
        join(pending, "commit.tmp"),
        JSON.stringify({ version: 2, hashes: fileHashes(dir) })
      );
      fsSync.renameSync(join(pending, "commit.tmp"), join(pending, "commit.json"));
      commitWritten = true;
      syncPath(pending);
      finish(dir, pending, false);
      return result;
    } catch (error) {
      // A visible commit is never compensated. Uncertain fsync/cleanup requires
      // authenticated recovery, which verifies the recorded committed hashes.
      if (commitWritten)
        throw new Error("Reconciliation committed; cleanup requires recovery", { cause: error });
      try {
        restore(dir, pending, before);
        finish(dir, pending, false);
      } catch (restoreError) {
        throw new Error("Reconciliation rollback failed; ledger blocked for recovery", {
          cause: restoreError,
        });
      }
      throw error;
    } finally {
      internalReads.delete(pending);
    }
  });
}
