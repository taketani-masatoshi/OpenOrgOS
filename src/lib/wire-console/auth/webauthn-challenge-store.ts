import {
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { ensureOrgOsStateDir, getOrgOsStateDir } from "../paths.js";

const STORE_FILENAME = "webauthn-challenges.json";
const LOCK_FILENAME = "webauthn-challenges.lock";
const DEFAULT_TTL_MS = 5 * 60_000;
const LOCK_RETRY_MS = 25;
const LOCK_MAX_ATTEMPTS = 80;

/** BSD flock(2) operations — not exposed in Node's fs.constants typings. */
const LOCK_EX = 2;
const LOCK_NB = 4;
const LOCK_UN = 8;

type FlockFn = (fd: number, operation: number) => void;

/** Node exposes fs.flock on Linux; macOS dev falls back to wx lock files. */
function resolveFlock(): FlockFn | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs") & { flock?: FlockFn };
    return typeof fs.flock === "function" ? fs.flock.bind(fs) : null;
  } catch {
    return null;
  }
}

const flockSync = resolveFlock();
const useFlock = flockSync !== null;

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
  guest_invite_token?: string;
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
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cleanupStaleLockFile(): void {
  const path = lockPath();
  if (!existsSync(path)) return;
  try {
    const st = statSync(path);
    if (st.size === 0) {
      unlinkSync(path);
      return;
    }
    const pid = Number(readFileSync(path, "utf-8").trim());
    if (!Number.isFinite(pid) || pid <= 0) {
      unlinkSync(path);
      return;
    }
    process.kill(pid, 0);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH" || code === "ENOENT") {
      try {
        unlinkSync(path);
      } catch {
        /* ignore */
      }
    }
  }
}

function acquireLock(): number {
  ensureOrgOsStateDir();
  cleanupStaleLockFile();
  if (useFlock && flockSync) {
    const fd = openSync(lockPath(), "a");
    for (let i = 0; i < LOCK_MAX_ATTEMPTS; i++) {
      try {
        flockSync(fd, LOCK_EX | LOCK_NB);
        return fd;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "EWOULDBLOCK" && code !== "EAGAIN") {
          closeSync(fd);
          throw err;
        }
        sleepMs(LOCK_RETRY_MS);
      }
    }
    closeSync(fd);
    throw new WebAuthnChallengeStoreCorruptError("webauthn challenge store lock timeout");
  }

  for (let i = 0; i < LOCK_MAX_ATTEMPTS; i++) {
    try {
      const fd = openSync(lockPath(), "wx");
      writeSync(fd, String(process.pid));
      return fd;
    } catch {
      cleanupStaleLockFile();
      sleepMs(LOCK_RETRY_MS);
    }
  }
  throw new WebAuthnChallengeStoreCorruptError("webauthn challenge store lock timeout");
}

function releaseLock(fd: number): void {
  if (useFlock && flockSync) {
    try {
      flockSync(fd, LOCK_UN);
    } catch {
      /* ignore */
    }
    try {
      closeSync(fd);
    } catch {
      /* ignore */
    }
    return;
  }

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
  if (memoryOverride) {
    const doc = purgeExpired(readStoreUnlocked());
    const result = fn(doc);
    writeStoreUnlocked(doc);
    return result;
  }

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
  const lock = lockPath();
  if (existsSync(lock)) unlinkSync(lock);
}

/** Test helper: whether this runtime uses advisory flock (Linux prod) vs wx fallback. */
export function webauthnChallengeStoreUsesFlock(): boolean {
  return useFlock;
}

export interface WebAuthnChallengeStoreProbe {
  ok: boolean;
  detail: string;
  lock: "flock" | "wx";
}

/** Best-effort read/write probe for doctor / field-check (does not leave challenges behind). */
export function probeWebAuthnChallengeStore(): WebAuthnChallengeStoreProbe {
  const lock: "flock" | "wx" = useFlock ? "flock" : "wx";
  if (memoryOverride) {
    return { ok: true, detail: "in-memory challenge store (test override)", lock };
  }
  const token = `probe-${process.pid}-${Date.now()}`;
  try {
    saveWebAuthnChallenge({
      kind: "login",
      challenge: token,
      expires_at: Date.now() + 5_000,
    });
    const consumed = consumeWebAuthnChallenge(token, "login");
    if (!consumed) {
      return { ok: false, detail: "challenge store probe write succeeded but consume failed", lock };
    }
    return { ok: true, detail: `challenge store read/write ok (${lock} lock)`, lock };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "challenge store probe failed",
      lock,
    };
  }
}
