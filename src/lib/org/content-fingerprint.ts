import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import YAML from "yaml";
import { canonicalJson } from "../protocol/canonical.js";

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256Prefixed(data: string | Buffer): string {
  return `sha256:${sha256Hex(data)}`;
}

/** Normalize markdown / text for stable hashing (not semantic equality). */
export function normalizeTextForHash(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim() + "\n";
}

export function hashTextFile(absPath: string): string {
  if (!existsSync(absPath)) {
    throw new Error(`Missing file for fingerprint: ${absPath}`);
  }
  return sha256Prefixed(normalizeTextForHash(readFileSync(absPath, "utf-8")));
}

export function hashCanonicalValue(value: unknown): string {
  return sha256Prefixed(canonicalJson(value));
}

export function parseYamlFile(absPath: string): unknown {
  if (!existsSync(absPath)) {
    throw new Error(`Missing YAML for fingerprint: ${absPath}`);
  }
  return YAML.parse(readFileSync(absPath, "utf-8"));
}

export function hashYamlFile(absPath: string): string {
  return hashCanonicalValue(parseYamlFile(absPath));
}
