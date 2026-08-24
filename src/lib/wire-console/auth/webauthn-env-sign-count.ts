import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ensureOrgOsStateDir, getOrgOsStateDir } from "../paths.js";

const STORE_FILENAME = "webauthn-sign-counts.json";

interface SignCountDocument {
  counts: Record<string, number>;
}

let memoryOverride: SignCountDocument | undefined;

function storePath(): string {
  return join(getOrgOsStateDir(), STORE_FILENAME);
}

function readStore(): SignCountDocument {
  if (memoryOverride) return memoryOverride;
  const path = storePath();
  if (!existsSync(path)) return { counts: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as SignCountDocument;
    if (parsed && typeof parsed === "object" && parsed.counts) return parsed;
  } catch {
    /* rebuild */
  }
  return { counts: {} };
}

function writeStore(doc: SignCountDocument): void {
  ensureOrgOsStateDir();
  const target = storePath();
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2), { encoding: "utf-8", mode: 0o600 });
  renameSync(tmp, target);
  try {
    chmodSync(target, 0o600);
  } catch {
    /* best-effort */
  }
  if (memoryOverride) memoryOverride = doc;
}

export function readEnvManagedSignCount(credentialId: string): number | undefined {
  const value = readStore().counts[credentialId];
  return value === undefined ? undefined : value;
}

export function writeEnvManagedSignCount(credentialId: string, signCount: number): void {
  const doc = readStore();
  doc.counts[credentialId] = signCount;
  writeStore(doc);
}

export function resetEnvManagedSignCountsForTests(): void {
  memoryOverride = { counts: {} };
}
