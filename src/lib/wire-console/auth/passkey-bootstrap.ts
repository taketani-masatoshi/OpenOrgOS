import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isProdSecurityMode } from "../../console-auth/operator-rbac.js";
import { ensureOrgOsStateDir, getOrgOsStateDir } from "../paths.js";

const STORE_FILENAME = "passkey-bootstrap.json";
const TOKEN_PREFIX = "pkb_";

interface BootstrapTokenRecord {
  operator_id: string;
  token_hash: string;
  expires_at: string;
  used_at?: string;
  reserved_challenge_hash?: string;
}

interface BootstrapStoreDocument {
  tokens: BootstrapTokenRecord[];
}

export class PasskeyBootstrapStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasskeyBootstrapStoreError";
  }
}

function storePath(): string {
  return join(getOrgOsStateDir(), STORE_FILENAME);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf-8").digest("hex");
}

function readStore(): BootstrapStoreDocument {
  const path = storePath();
  if (!existsSync(path)) return { tokens: [] };
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (error) {
    throw new PasskeyBootstrapStoreError(
      error instanceof Error ? error.message : "bootstrap store unreadable",
    );
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new PasskeyBootstrapStoreError("bootstrap store JSON corrupt");
  }
  if (!doc || typeof doc !== "object" || !Array.isArray((doc as BootstrapStoreDocument).tokens)) {
    throw new PasskeyBootstrapStoreError("bootstrap store missing tokens array");
  }
  return doc as BootstrapStoreDocument;
}

function writeStore(doc: BootstrapStoreDocument): void {
  ensureOrgOsStateDir();
  const path = storePath();
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2), { encoding: "utf-8", mode: 0o600 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort */
  }
}

function parseTtl(ttl: string): number {
  const m = ttl.trim().match(/^(\d+(?:\.\d+)?)(h|m|s)?$/i);
  if (!m) throw new Error(`invalid ttl: ${ttl}`);
  const n = Number(m[1]);
  const unit = (m[2] ?? "h").toLowerCase();
  if (unit === "h") return n * 3600_000;
  if (unit === "m") return n * 60_000;
  return n * 1000;
}

export function mintPasskeyBootstrapToken(opts: {
  operatorId: string;
  ttl?: string;
}): { token: string; expires_at: string } {
  const operatorId = opts.operatorId.trim();
  if (!operatorId) throw new Error("operator_id required");
  const ttlMs = parseTtl(opts.ttl ?? "24h");
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const doc = readStore();
  doc.tokens = doc.tokens.filter(
    (t) => t.operator_id !== operatorId || Boolean(t.used_at),
  );
  doc.tokens.push({
    operator_id: operatorId,
    token_hash: hashToken(token),
    expires_at: expiresAt,
  });
  writeStore(doc);
  return { token, expires_at: expiresAt };
}

export type BootstrapTokenVerifyResult =
  | { ok: true; operator_id: string }
  | { ok: false; error: string };

export function verifyPasskeyBootstrapToken(
  token: string | undefined,
  operatorId: string,
): BootstrapTokenVerifyResult {
  if (!token?.trim()) {
    return { ok: false, error: "bootstrap token required" };
  }
  const doc = readStore();
  const hash = hashToken(token.trim());
  const record = doc.tokens.find(
    (t) =>
      t.operator_id === operatorId &&
      !t.used_at &&
      t.token_hash === hash &&
      new Date(t.expires_at).getTime() > Date.now(),
  );
  if (!record) {
    return { ok: false, error: "bootstrap token invalid, expired, or already used" };
  }
  return { ok: true, operator_id: operatorId };
}

export function reservePasskeyBootstrapChallenge(opts: {
  token: string;
  operatorId: string;
  challenge: string;
}): BootstrapTokenVerifyResult {
  const verified = verifyPasskeyBootstrapToken(opts.token, opts.operatorId);
  if (!verified.ok) return verified;
  const doc = readStore();
  const hash = hashToken(opts.token.trim());
  const challengeHash = hashToken(opts.challenge);
  const idx = doc.tokens.findIndex(
    (t) => t.operator_id === opts.operatorId && t.token_hash === hash && !t.used_at,
  );
  if (idx < 0) {
    return { ok: false, error: "bootstrap token not found" };
  }
  doc.tokens[idx] = {
    ...doc.tokens[idx]!,
    reserved_challenge_hash: challengeHash,
  };
  writeStore(doc);
  return verified;
}

export function consumePasskeyBootstrapToken(opts: {
  token: string;
  operatorId: string;
  challenge: string;
}): BootstrapTokenVerifyResult {
  const doc = readStore();
  const hash = hashToken(opts.token.trim());
  const challengeHash = hashToken(opts.challenge);
  const idx = doc.tokens.findIndex(
    (t) =>
      t.operator_id === opts.operatorId &&
      t.token_hash === hash &&
      !t.used_at &&
      new Date(t.expires_at).getTime() > Date.now(),
  );
  if (idx < 0) {
    return { ok: false, error: "bootstrap token invalid or expired" };
  }
  const record = doc.tokens[idx]!;
  if (isProdSecurityMode() && !record.reserved_challenge_hash) {
    return {
      ok: false,
      error: "bootstrap token must be reserved via register options first",
    };
  }
  if (record.reserved_challenge_hash) {
    const a = Buffer.from(record.reserved_challenge_hash, "utf-8");
    const b = Buffer.from(challengeHash, "utf-8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: "bootstrap token not reserved for this challenge" };
    }
  }
  doc.tokens[idx] = {
    ...record,
    used_at: new Date().toISOString(),
  };
  writeStore(doc);
  return { ok: true, operator_id: opts.operatorId };
}

export function hasUnusedPasskeyBootstrapToken(operatorId?: string): boolean {
  const doc = readStore();
  const now = Date.now();
  return doc.tokens.some(
    (t) =>
      (!operatorId || t.operator_id === operatorId) &&
      !t.used_at &&
      new Date(t.expires_at).getTime() > now,
  );
}

export function resetPasskeyBootstrapStoreForTests(): void {
  writeStore({ tokens: [] });
}
