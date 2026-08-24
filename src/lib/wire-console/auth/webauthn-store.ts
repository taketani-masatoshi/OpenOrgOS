import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { ensureOrgOsStateDir, WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH } from "../paths.js";
import type { WebAuthnCredentialPurpose } from "../../../../schemas/org/settlement-stepup.js";
import { rpId } from "./webauthn-shared.js";

export interface StoredWebAuthnCredential {
  credential_id: string;
  public_key_spki_base64: string;
  operator_id: string;
  approver_id: string;
  sign_count?: number;
  created_at?: string;
  /** ADR 0037 — missing treated as login */
  purpose?: WebAuthnCredentialPurpose;
  rp_id?: string;
  authenticator_attachment?: "platform" | "cross-platform";
}

interface CredentialStoreDocument {
  credentials: StoredWebAuthnCredential[];
}

export class WebAuthnCredentialStoreCorruptError extends Error {
  constructor(message = "credential store unreadable") {
    super(message);
    this.name = "WebAuthnCredentialStoreCorruptError";
  }
}

let memoryOverride: StoredWebAuthnCredential[] | undefined;

function hardenStoreMode(): void {
  try {
    if (existsSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH)) {
      chmodSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH, 0o600);
    }
  } catch {
    /* best-effort on platforms that ignore mode */
  }
}

function readStoreFile(): StoredWebAuthnCredential[] {
  if (!existsSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH)) return [];
  hardenStoreMode();
  let raw: string;
  try {
    raw = readFileSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH, "utf-8");
  } catch (error) {
    throw new WebAuthnCredentialStoreCorruptError(
      error instanceof Error ? error.message : "credential store unreadable",
    );
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new WebAuthnCredentialStoreCorruptError("credential store JSON corrupt");
  }
  if (
    !doc ||
    typeof doc !== "object" ||
    !Array.isArray((doc as CredentialStoreDocument).credentials)
  ) {
    throw new WebAuthnCredentialStoreCorruptError(
      "credential store missing credentials array",
    );
  }
  return (doc as CredentialStoreDocument).credentials;
}

function writeStoreFile(credentials: StoredWebAuthnCredential[]): void {
  ensureOrgOsStateDir();
  const doc: CredentialStoreDocument = { credentials };
  const target = WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH;
  const tmp = join(dirname(target), `.webauthn-credentials.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(doc, null, 2), { encoding: "utf-8", mode: 0o600 });
  renameSync(tmp, target);
  hardenStoreMode();
}

function normalizeCredential(c: StoredWebAuthnCredential): StoredWebAuthnCredential {
  return {
    ...c,
    purpose: c.purpose ?? "login",
    rp_id: c.rp_id ?? rpId(),
  };
}

function loadEnvCredentials(): StoredWebAuthnCredential[] {
  const raw = process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      credential_id: string;
      public_key_spki_base64?: string;
      public_key_base64?: string;
      operator_id: string;
      approver_id: string;
      sign_count?: number;
      purpose?: WebAuthnCredentialPurpose;
      rp_id?: string;
      authenticator_attachment?: "platform" | "cross-platform";
    }>;
    return parsed
      .filter((c) => c.credential_id && c.operator_id && c.approver_id)
      .map((c) =>
        normalizeCredential({
          credential_id: c.credential_id,
          public_key_spki_base64: c.public_key_spki_base64 ?? c.public_key_base64 ?? "",
          operator_id: c.operator_id,
          approver_id: c.approver_id,
          sign_count: c.sign_count,
          purpose: c.purpose,
          rp_id: c.rp_id,
          authenticator_attachment: c.authenticator_attachment,
        }),
      )
      .filter((c) => c.public_key_spki_base64);
  } catch {
    return [];
  }
}

export function credentialPurpose(c: StoredWebAuthnCredential): WebAuthnCredentialPurpose {
  return c.purpose ?? "login";
}

export function listWebAuthnCredentials(): StoredWebAuthnCredential[] {
  const file = memoryOverride ?? readStoreFile();
  const env = loadEnvCredentials();
  const byId = new Map<string, StoredWebAuthnCredential>();
  for (const cred of file) byId.set(cred.credential_id, normalizeCredential(cred));
  for (const cred of env) byId.set(cred.credential_id, normalizeCredential(cred));
  return [...byId.values()];
}

export function listWebAuthnCredentialsByPurpose(
  purpose: WebAuthnCredentialPurpose,
  opts?: { rpId?: string },
): StoredWebAuthnCredential[] {
  const wantRp = opts?.rpId;
  return listWebAuthnCredentials().filter((c) => {
    if (credentialPurpose(c) !== purpose) return false;
    if (wantRp && (c.rp_id ?? rpId()) !== wantRp) return false;
    return true;
  });
}

export function findWebAuthnCredential(credentialId: string): StoredWebAuthnCredential | undefined {
  return listWebAuthnCredentials().find((c) => c.credential_id === credentialId);
}

export function saveWebAuthnCredential(credential: StoredWebAuthnCredential): void {
  const file = memoryOverride ?? readStoreFile();
  const next = file.filter((c) => c.credential_id !== credential.credential_id);
  next.push({
    ...normalizeCredential(credential),
    created_at: credential.created_at ?? new Date().toISOString(),
  });
  if (memoryOverride) {
    memoryOverride = next;
    return;
  }
  writeStoreFile(next);
}

export function updateWebAuthnSignCount(credentialId: string, signCount: number): void {
  if (isEnvManagedWebAuthnCredential(credentialId)) {
    // Env-backed credentials are not writable; callers still run replay checks
    // against previousSignCount when present on the merged view.
    return;
  }
  const file = memoryOverride ?? readStoreFile();
  const idx = file.findIndex((c) => c.credential_id === credentialId);
  if (idx < 0) return;
  file[idx] = { ...file[idx]!, sign_count: signCount };
  if (memoryOverride) {
    memoryOverride = file;
    return;
  }
  writeStoreFile(file);
}

function envCredentialIds(): Set<string> {
  return new Set(loadEnvCredentials().map((c) => c.credential_id));
}

export function isEnvManagedWebAuthnCredential(credentialId: string): boolean {
  return envCredentialIds().has(credentialId);
}

export function deleteWebAuthnCredential(credentialId: string): {
  ok: boolean;
  error?: string;
} {
  if (isEnvManagedWebAuthnCredential(credentialId)) {
    return {
      ok: false,
      error: "this passkey is managed by environment configuration and cannot be removed here",
    };
  }
  const file = memoryOverride ?? readStoreFile();
  const next = file.filter((c) => c.credential_id !== credentialId);
  if (next.length === file.length) {
    return { ok: false, error: "passkey not found" };
  }
  if (memoryOverride) {
    memoryOverride = next;
    return { ok: true };
  }
  writeStoreFile(next);
  return { ok: true };
}

export function setWebAuthnCredentialsForTests(credentials: StoredWebAuthnCredential[]): void {
  memoryOverride = credentials.map(normalizeCredential);
}

export function resetWebAuthnCredentialsForTests(): void {
  memoryOverride = [];
}
