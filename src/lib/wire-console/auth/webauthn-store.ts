import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ensureOrgOsStateDir, WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH } from "../paths.js";

export interface StoredWebAuthnCredential {
  credential_id: string;
  public_key_spki_base64: string;
  operator_id: string;
  approver_id: string;
  sign_count?: number;
  created_at?: string;
}

interface CredentialStoreDocument {
  credentials: StoredWebAuthnCredential[];
}

let memoryOverride: StoredWebAuthnCredential[] | undefined;

function readStoreFile(): StoredWebAuthnCredential[] {
  if (!existsSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH)) return [];
  try {
    const doc = JSON.parse(readFileSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH, "utf-8")) as CredentialStoreDocument;
    return Array.isArray(doc.credentials) ? doc.credentials : [];
  } catch {
    return [];
  }
}

function writeStoreFile(credentials: StoredWebAuthnCredential[]): void {
  ensureOrgOsStateDir();
  const doc: CredentialStoreDocument = { credentials };
  writeFileSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH, JSON.stringify(doc, null, 2), "utf-8");
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
    }>;
    return parsed
      .filter((c) => c.credential_id && c.operator_id && c.approver_id)
      .map((c) => ({
        credential_id: c.credential_id,
        public_key_spki_base64: c.public_key_spki_base64 ?? c.public_key_base64 ?? "",
        operator_id: c.operator_id,
        approver_id: c.approver_id,
        sign_count: c.sign_count,
      }))
      .filter((c) => c.public_key_spki_base64);
  } catch {
    return [];
  }
}

export function listWebAuthnCredentials(): StoredWebAuthnCredential[] {
  const file = memoryOverride ?? readStoreFile();
  const env = loadEnvCredentials();
  const byId = new Map<string, StoredWebAuthnCredential>();
  for (const cred of file) byId.set(cred.credential_id, cred);
  for (const cred of env) byId.set(cred.credential_id, cred);
  return [...byId.values()];
}

export function findWebAuthnCredential(credentialId: string): StoredWebAuthnCredential | undefined {
  return listWebAuthnCredentials().find((c) => c.credential_id === credentialId);
}

export function saveWebAuthnCredential(credential: StoredWebAuthnCredential): void {
  const file = memoryOverride ?? readStoreFile();
  const next = file.filter((c) => c.credential_id !== credential.credential_id);
  next.push({
    ...credential,
    created_at: credential.created_at ?? new Date().toISOString(),
  });
  if (memoryOverride) {
    memoryOverride = next;
    return;
  }
  writeStoreFile(next);
}

export function updateWebAuthnSignCount(credentialId: string, signCount: number): void {
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

export function resetWebAuthnCredentialsForTests(): void {
  memoryOverride = [];
  if (existsSync(WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH)) {
    writeStoreFile([]);
  }
}

export function useInMemoryWebAuthnCredentialsForTests(credentials: StoredWebAuthnCredential[]): void {
  memoryOverride = credentials;
}
