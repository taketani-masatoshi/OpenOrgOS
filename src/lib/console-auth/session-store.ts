import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getWorkspaceRoot } from "../orgos-paths.js";

export interface PersistedSessionRecord {
  user: {
    operator_id: string;
    approver_id: string;
    mode: "dev" | "prod";
  };
  created_at: string;
  expires_at?: string;
}

interface PersistedSessionFile {
  version: 1;
  sessions: Record<string, PersistedSessionRecord>;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionStorePath(): string {
  const fromEnv = process.env.ORGOS_SESSION_STORE?.trim();
  if (fromEnv) return fromEnv;
  return join(getWorkspaceRoot(), "data", ".orgos", "sessions.json");
}

function readStoreFile(): PersistedSessionFile {
  const path = sessionStorePath();
  if (!existsSync(path)) {
    return { version: 1, sessions: {} };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as PersistedSessionFile;
    if (parsed.version === 1 && parsed.sessions) return parsed;
  } catch {
    /* rebuild */
  }
  return { version: 1, sessions: {} };
}

function writeStoreFile(data: PersistedSessionFile): void {
  const path = sessionStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

function purgeExpired(data: PersistedSessionFile): PersistedSessionFile {
  const now = Date.now();
  const sessions: Record<string, PersistedSessionRecord> = {};
  for (const [token, record] of Object.entries(data.sessions)) {
    if (record.expires_at && Date.parse(record.expires_at) < now) continue;
    sessions[token] = record;
  }
  return { version: 1, sessions };
}

export function loadPersistedSessions(): Map<string, PersistedSessionRecord> {
  const file = purgeExpired(readStoreFile());
  writeStoreFile(file);
  return new Map(Object.entries(file.sessions));
}

export function savePersistedSessions(sessions: Map<string, PersistedSessionRecord>): void {
  const file: PersistedSessionFile = {
    version: 1,
    sessions: Object.fromEntries(sessions.entries()),
  };
  writeStoreFile(file);
}

export function sessionPersistenceEnabled(): boolean {
  return process.env.ORGOS_SESSION_PERSIST !== "0";
}

export function sessionTtlMs(): number {
  const raw = process.env.ORGOS_SESSION_TTL_MS?.trim();
  if (!raw) return DEFAULT_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
}

export function cookieSecureEnabled(): boolean {
  return process.env.ORGOS_COOKIE_SECURE === "1" || process.env.STEWARD_CHAT_SECURE === "1";
}
