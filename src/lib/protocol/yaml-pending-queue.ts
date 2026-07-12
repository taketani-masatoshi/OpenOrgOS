import { existsSync } from "node:fs";
import type { z } from "zod";
import { currentDate, readYamlFile, writeYamlFile } from "../utils.js";

type PendingEntryBase = {
  attempts: number;
  created_at: string;
};

type PendingRegistryBase<TEntry> = {
  as_of?: string;
  pending: TEntry[];
};

export interface YamlPendingQueueStore<
  TEntry extends PendingEntryBase,
  TRegistry extends PendingRegistryBase<TEntry>,
> {
  load(): TRegistry;
  save(registry: TRegistry): void;
  enqueue(
    entry: Omit<TEntry, "attempts" | "created_at"> & { attempts?: number; created_at?: string }
  ): TEntry;
  /** Archive matching entries (append-only hook) then remove from active pending. */
  archive(match: (entry: TEntry) => boolean, reason: string): TEntry[];
  /** @deprecated Prefer {@link archive} with an explicit reason. */
  remove(match: (entry: TEntry) => boolean): void;
  list(): TEntry[];
}

export function createYamlPendingQueueStore<
  TEntry extends PendingEntryBase,
  TRegistry extends PendingRegistryBase<TEntry>,
>(opts: {
  getPath: () => string;
  schema: z.ZodType<TRegistry, z.ZodTypeDef, unknown>;
  entryKey: (entry: TEntry) => string;
  emptyRegistry: () => TRegistry;
  onArchive?: (entry: TEntry, reason: string) => void;
}): YamlPendingQueueStore<TEntry, TRegistry> {
  const load = (): TRegistry => {
    const path = opts.getPath();
    if (!existsSync(path)) {
      return opts.emptyRegistry();
    }
    return readYamlFile(path, opts.schema);
  };

  const save = (registry: TRegistry): void => {
    writeYamlFile(opts.getPath(), { ...registry, as_of: currentDate() });
  };

  const archive = (match: (entry: TEntry) => boolean, reason: string): TEntry[] => {
    const registry = load();
    const removed: TEntry[] = [];
    const kept: TEntry[] = [];
    for (const entry of registry.pending) {
      if (match(entry)) {
        removed.push(entry);
        opts.onArchive?.(entry, reason);
      } else {
        kept.push(entry);
      }
    }
    if (removed.length === 0) return removed;
    registry.pending = kept;
    save(registry);
    return removed;
  };

  return {
    load,
    save,
    enqueue(entry) {
      const registry = load();
      const key = opts.entryKey(entry as TEntry);
      const existingIdx = registry.pending.findIndex((p) => opts.entryKey(p) === key);
      const record = {
        ...entry,
        attempts: entry.attempts ?? 0,
        created_at: entry.created_at ?? new Date().toISOString(),
      } as TEntry;
      if (existingIdx >= 0) {
        registry.pending[existingIdx] = {
          ...registry.pending[existingIdx]!,
          ...record,
          attempts: (registry.pending[existingIdx]!.attempts ?? 0) + 1,
        };
      } else {
        registry.pending.push(record);
      }
      save(registry);
      return existingIdx >= 0 ? registry.pending[existingIdx]! : record;
    },
    archive,
    remove(match) {
      archive(match, "removed");
    },
    list() {
      return load().pending;
    },
  };
}
