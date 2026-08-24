import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { withYamlFileLock } from "../../yaml-atomic.js";
import { FsGuardError } from "./errors.js";
import { fsGuardPaths } from "./store.js";

const LEASE_TTL_MS = 30_000;

type CanonicalLease = {
  path: string;
  agent_id: string;
  run_id?: string;
  expires_at: string;
  owner_pid: number;
  nest: number;
};

type LeaseFile = {
  version: "1";
  leases: CanonicalLease[];
};

function isLeaseFile(value: unknown): value is LeaseFile {
  if (!value || typeof value !== "object") return false;
  const file = value as LeaseFile;
  return file.version === "1" && Array.isArray(file.leases);
}

function loadLeases(): LeaseFile {
  const path = fsGuardPaths().leasesPath;
  if (!existsSync(path)) return { version: "1", leases: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    throw new FsGuardError("lease_corrupt", `Canonical lease file is not valid JSON: ${path}`);
  }
  if (!isLeaseFile(parsed)) {
    throw new FsGuardError("lease_corrupt", `Canonical lease file schema invalid: ${path}`);
  }
  return parsed;
}

function saveLeases(file: LeaseFile): void {
  const path = fsGuardPaths().leasesPath;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
}

function prune(file: LeaseFile, nowMs: number): CanonicalLease[] {
  return file.leases.filter((lease) => Date.parse(lease.expires_at) > nowMs);
}

function sameNestedOwner(held: CanonicalLease, agentId: string, runId?: string): boolean {
  if (held.agent_id !== agentId || held.owner_pid !== process.pid) return false;
  if (held.run_id && runId && held.run_id !== runId) return false;
  return true;
}

/**
 * Short exclusive lease on a canonical logical path (AIA shared YAML).
 * Fail-closed if another agent, process, or run holds an unexpired lease.
 * Same agent + same pid may re-enter (nested writeYamlFile).
 */
export function withCanonicalLease<T>(
  logicalPath: string,
  agentId: string,
  fn: () => T,
  runId?: string
): T {
  const paths = fsGuardPaths();
  const nowMs = Date.now();
  const expiresAt = new Date(nowMs + LEASE_TTL_MS).toISOString();
  withYamlFileLock(paths.leasesPath, () => {
    const file = loadLeases();
    const live = prune(file, nowMs);
    const held = live.find((lease) => lease.path === logicalPath);
    if (held && !sameNestedOwner(held, agentId, runId)) {
      throw new FsGuardError(
        "lease_held",
        `Canonical path ${logicalPath} is leased by ${held.agent_id} until ${held.expires_at}`
      );
    }
    const nest = held && sameNestedOwner(held, agentId, runId) ? held.nest + 1 : 1;
    saveLeases({
      version: "1",
      leases: [
        ...live.filter((lease) => lease.path !== logicalPath),
        {
          path: logicalPath,
          agent_id: agentId,
          run_id: runId ?? held?.run_id,
          expires_at: expiresAt,
          owner_pid: process.pid,
          nest,
        },
      ],
    });
  });
  try {
    return fn();
  } finally {
    withYamlFileLock(paths.leasesPath, () => {
      const file = loadLeases();
      const live = prune(file, Date.now());
      const held = live.find(
        (lease) => lease.path === logicalPath && lease.agent_id === agentId && lease.owner_pid === process.pid
      );
      const rest = live.filter(
        (lease) => !(lease.path === logicalPath && lease.agent_id === agentId && lease.owner_pid === process.pid)
      );
      if (held && held.nest > 1) {
        saveLeases({
          version: "1",
          leases: [...rest, { ...held, nest: held.nest - 1 }],
        });
        return;
      }
      saveLeases({ version: "1", leases: rest });
    });
  }
}
