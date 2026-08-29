/**
 * Generic gitignored env-file secret store (mode 0600).
 * Path: src/lib/secrets/env-file-store.ts
 *
 * Deploy env wins; the file only fills gaps for secrets saved from the Console.
 * Values never leave the server — callers expose masked hints only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function serializeEnvFile(
  keys: readonly string[],
  values: Record<string, string>,
  header: readonly string[],
): string {
  const lines = [...header, ""];
  for (const key of keys) {
    const value = values[key]?.trim();
    if (value) lines.push(`${key}=${value}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseEnvFile(readFileSync(path, "utf-8"));
}

export function writeEnvFile(
  path: string,
  keys: readonly string[],
  values: Record<string, string>,
  header: readonly string[],
): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeEnvFile(keys, values, header), { mode: 0o600 });
}

/** Short, non-reversible display hint. Never return the raw secret. */
export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 12) return "••••";
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

/** Fill `process.env` gaps from the store. Existing env values win. */
export function hydrateEnvFromFile(path: string, keys: readonly string[]): void {
  const fromFile = readEnvFile(path);
  for (const key of keys) {
    if (process.env[key]?.trim()) continue;
    const value = fromFile[key]?.trim();
    if (value) process.env[key] = value;
  }
}
