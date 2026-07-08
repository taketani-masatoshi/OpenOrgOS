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
  remove(match: (entry: TEntry) => boolean): void;
  list(): TEntry[];
}

export function createYamlPendingQueueStore<
  TEntry extends PendingEntryBase,
  TRegistry extends PendingRegistryBase<TEntry>,
>(opts: {
  getPath: () => string;
  schema: z.ZodType<TRegistry>;
  entryKey: (entry: TEntry) => string;
  emptyRegistry: () => TRegistry;
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
    remove(match) {
      const registry = load();
      registry.pending = registry.pending.filter((p) => !match(p));
      save(registry);
    },
    list() {
      return load().pending;
    },
  };
}
