import { AsyncLocalStorage } from "node:async_hooks";

interface FsGuardAgentStore {
  agentId: string;
}

const als = new AsyncLocalStorage<FsGuardAgentStore>();
const internalAls = new AsyncLocalStorage<true>();

export function getFsGuardAgent(): string | undefined {
  return als.getStore()?.agentId ?? (process.env.ORGOS_FS_GUARD_AGENT?.trim() || undefined);
}

export function runWithFsGuardAgent<T>(agentId: string, fn: () => T): T {
  return als.run({ agentId }, () => {
    const prev = process.env.ORGOS_FS_GUARD_AGENT;
    process.env.ORGOS_FS_GUARD_AGENT = agentId;
    try {
      return fn();
    } finally {
      if (prev === undefined) delete process.env.ORGOS_FS_GUARD_AGENT;
      else process.env.ORGOS_FS_GUARD_AGENT = prev;
    }
  });
}

export async function runWithFsGuardAgentAsync<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
  return als.run({ agentId }, async () => {
    const prev = process.env.ORGOS_FS_GUARD_AGENT;
    process.env.ORGOS_FS_GUARD_AGENT = agentId;
    try {
      return await fn();
    } finally {
      if (prev === undefined) delete process.env.ORGOS_FS_GUARD_AGENT;
      else process.env.ORGOS_FS_GUARD_AGENT = prev;
    }
  });
}

/** Guard runtime ledger writes — skips wrapCanonicalWrite policy (not exported from index). */
export function runFsGuardInternal<T>(fn: () => T): T {
  return internalAls.run(true, fn);
}

export function isFsGuardInternal(): boolean {
  return internalAls.getStore() === true;
}
