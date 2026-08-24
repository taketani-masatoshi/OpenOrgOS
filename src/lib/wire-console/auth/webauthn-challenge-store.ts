import {
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ensureOrgOsStateDir, getOrgOsStateDir } from "../paths.js";

const STORE_FILENAME = "webauthn-challenges.json";
const LOCK_FILENAME = "webauthn-challenges.lock";
const DEFAULT_TTL_MS = 5 * 60_000;
const LOCK_RETRY_MS = 25;
const LOCK_MAX_ATTEMPTS = 80;

export class WebAuthnChallengeStoreCorruptError extends Error {
  constructor(message = "webauthn challenge store unreadable") {
    super(message);
    this.name = "WebAuthnChallengeStoreCorruptError";
  }
}

export type WebAuthnChallengeKind = "login" | "register";

export interface StoredWebAuthnChallenge {
  kind: WebAuthnChallengeKind;
  challenge: string;
  expires_at: number;
  /** Register-only fields */
  operator_id?: string;
  approver_id?: string;
  purpose?: "login" | "settlement";
  rp_id?: string;
  bootstrap_token?: string;
}

interface ChallengeStoreDocument {
  version: 1;
  challenges: Record<string, StoredWebAuthnChallenge>;
}

let memoryOverride: ChallengeStoreDocument | undefined;

function storePath(): string {
  return join(getOrgOsStateDir(), STORE_FILENAME);
}

function lockPath(): string {
  return join(getOrgOsStateDir(), LOCK_FILENAME);
}

function hardenStoreMode(path: string): void {
  try {
    if (existsSync(path)) chmodSync(path, 0o600);
  } catch {
    /* best-effort */
  }
}

function sleepMs(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

function acquireLock(): number {
  ensureOrgOsStateDir();
  for (let i = 0; i < LOCK_MAX_ATTEMPTS; i++) {
    try {
      return openSync(lockPath(), "wx");
    } catch {
      sleepMs(LOCK_RETRY_MS);
    }
  }
  throw new WebAuthnChallengeStoreCorruptError("webauthn challenge store lock timeout");
}

function releaseLock(fd: number): void {
  try {
    closeSync(fd);
  } catch {
    /* ignore */
  }
  try {
    unlinkSync(lockPath());
  } catch {
    /* ignore */
  }
}

function readStoreUnlocked(): ChallengeStoreDocument {
  if (memoryOverride) return memoryOverride;
  const path = storePath();
  if (!existsSync(path)) return { version: 1, challenges: {} };
  hardenStoreMode(path);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (error) {
    throw new WebAuthnChallengeStoreCorruptError(
      error instanceof Error ? error.message : "webauthn challenge store unreadable",
    );
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new WebAuthnChallengeStoreCorruptError("webauthn challenge store JSON corrupt");
  }
  if (
    !doc ||
    typeof doc !== "object" ||
    (doc as ChallengeStoreDocument).version !== 1 ||
    typeof (doc as ChallengeStoreDocument).challenges !== "object"
  ) {
    throw new WebAuthnChallengeStoreCorruptError(
      "webauthn challenge store missing challenges object",
    );
  }
  return doc as ChallengeStoreDocument;
}

function writeStoreUnlocked(doc: ChallengeStoreDocument): void {
  if (memoryOverride) {
    memoryOverride = doc;
    return;
  }
  ensureOrgOsStateDir();
  const target = storePath();
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2), { encoding: "utf-8", mode: 0o600 });
  renameSync(tmp, target);
  hardenStoreMode(target);
}

function purgeExpired(doc: ChallengeStoreDocument): ChallengeStoreDocument {
  const now = Date.now();
  const challenges: Record<string, StoredWebAuthnChallenge> = {};
  for (const [key, record] of Object.entries(doc.challenges)) {
    if (record.expires_at >= now) {
      challenges[key] = record;
    }
  }
  return { version: 1, challenges };
}

function withStoreLock<T>(fn: (doc: ChallengeStoreDocument) => T): T {
  const fd = acquireLock();
  try {
    const doc = purgeExpired(readStoreUnlocked());
    const result = fn(doc);
    writeStoreUnlocked(doc);
    return result;
  } finally {
    releaseLock(fd);
  }
}

export function saveWebAuthnChallenge(record: StoredWebAuthnChallenge): void {
  withStoreLock((doc) => {
    doc.challenges[record.challenge] = record;
    return undefined;
  });
}

export function consumeWebAuthnChallenge(
  challenge: string,
  kind: WebAuthnChallengeKind,
): StoredWebAuthnChallenge | null {
  return withStoreLock((doc) => {
    const record = doc.challenges[challenge];
    if (!record || record.kind !== kind) return null;
    if (record.expires_at < Date.now()) {
      delete doc.challenges[challenge];
      return null;
    }
    delete doc.challenges[challenge];
    return record;
  });
}

export function peekWebAuthnChallenge(
  challenge: string,
  kind: WebAuthnChallengeKind,
): StoredWebAuthnChallenge | null {
  return withStoreLock((doc) => {
    const record = doc.challenges[challenge];
    if (!record || record.kind !== kind) return null;
    if (record.expires_at < Date.now()) {
      delete doc.challenges[challenge];
      return null;
    }
    return record;
  });
}

export function webauthnChallengeTtlMs(): number {
  return DEFAULT_TTL_MS;
}

export function resetWebAuthnChallengeStoreForTests(): void {
  memoryOverride = { version: 1, challenges: {} };
}

export function disableWebAuthnChallengeStoreMemoryForTests(): void {
  memoryOverride = undefined;
  const path = storePath();
  if (existsSync(path)) unlinkSync(path);
}
