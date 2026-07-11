import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Shared append-only JSONL store helpers used by the audit log and queue DB.
 * Each record is one JSON object per line; corrupt lines are skipped on read.
 */

export function appendJsonl<T>(path: string, record: T): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(record) + "\n", "utf-8");
}

export function loadJsonl<T>(path: string, parse: (raw: unknown) => T): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n").filter(Boolean)) {
    try {
      out.push(parse(JSON.parse(line)));
    } catch {
      // skip corrupt lines
    }
  }
  return out;
}

/**
 * Rewrite a single line (matched by `id`) in place. Returns the mutated record,
 * or undefined when the file or id is absent.
 */
export function updateJsonlLine<T extends { id: string }>(
  path: string,
  id: string,
  parse: (raw: unknown) => T,
  mutate: (current: T) => T
): T | undefined {
  if (!existsSync(path)) return undefined;
  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  let updated: T | undefined;
  const rewritten = lines.map((line) => {
    const record = parse(JSON.parse(line));
    if (record.id !== id) return line;
    updated = mutate(record);
    return JSON.stringify(updated);
  });
  if (updated) {
    writeFileSync(path, rewritten.join("\n") + (rewritten.length ? "\n" : ""), "utf-8");
  }
  return updated;
}
