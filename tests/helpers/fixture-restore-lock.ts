export interface FixtureLockOwner {
  token: string;
  pid: number;
  startedAt: number;
}

export const DEFAULT_OWNER_STALE_MS = 120_000;

/** Parse JSON owner marker, or the legacy "<pid>\\n<startedAt>" text. */
export function parseLockOwnerText(text: string): FixtureLockOwner | null {
  try {
    const parsed = JSON.parse(text) as Partial<FixtureLockOwner>;
    if (typeof parsed.token !== "string" || typeof parsed.pid !== "number") return null;
    return { token: parsed.token, pid: parsed.pid, startedAt: Number(parsed.startedAt) || 0 };
  } catch {
    const [pidRaw, startedRaw] = text.trim().split(/\s+/);
    const pid = Number(pidRaw);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return { token: `legacy-${pid}`, pid, startedAt: Number(startedRaw) || 0 };
  }
}

export function isLockAbandoned(
  owner: FixtureLockOwner,
  opts: {
    workerToken: string;
    now?: number;
    staleMs?: number;
    processExists: (pid: number) => boolean;
  },
): boolean {
  const now = opts.now ?? Date.now();
  const staleMs = opts.staleMs ?? DEFAULT_OWNER_STALE_MS;
  return (
    owner.token === opts.workerToken ||
    !opts.processExists(owner.pid) ||
    now - owner.startedAt > staleMs
  );
}

/** Snapshot dir names are `${pid}-${threadId}`. Dead pids are orphans. */
export function shouldPruneSnapshotDir(
  dirName: string,
  opts: { workerToken: string; selfPid: number; processExists: (pid: number) => boolean },
): "keep-self" | "keep-live" | "prune" {
  if (dirName === opts.workerToken) return "keep-self";
  const pid = Number(dirName.split("-")[0]);
  if (Number.isInteger(pid) && pid > 0 && pid !== opts.selfPid && opts.processExists(pid)) {
    return "keep-live";
  }
  if (Number.isInteger(pid) && pid > 0 && pid === opts.selfPid) return "keep-self";
  return "prune";
}
