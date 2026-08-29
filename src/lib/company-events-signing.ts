import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { canonicalJson } from "./protocol/canonical.js";
import { getDataDir, readYamlFile, writeYamlFile } from "./utils.js";
import { runWithEventsWriteGuard } from "./company-events-write-guard.js";

const signingKeyEntrySchema = z.object({
  key_id: z.string().regex(/^[a-f0-9]{16}$/),
  public_key: z.string().min(1),
  activated_at: z.string().min(1),
  retired_at: z.string().min(1).optional(),
});

const signingMetaV1Schema = z.object({
  rotated_at: z.string().min(1),
  public_key: z.string().min(1),
  purpose: z.literal("company_events_attestation"),
});

const signingMetaV2Schema = z.object({
  version: z.literal(2),
  purpose: z.literal("company_events_attestation"),
  active: signingKeyEntrySchema,
  history: z.array(signingKeyEntrySchema).default([]),
});

export type CompanyEventsSigningKeyEntry = z.output<typeof signingKeyEntrySchema>;
export type CompanyEventsSigningMetaV2 = z.output<typeof signingMetaV2Schema>;

function signingKeyPath(): string {
  return join(getDataDir(), ".orgos", "company-events-signing.pem");
}

function signingMetaPath(): string {
  return join(getDataDir(), "company-events-signing-meta.yaml");
}

export function deriveKeyId(publicKeyBase64: string): string {
  const der = Buffer.from(publicKeyBase64, "base64");
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

export function loadCompanyEventsSigningKeyPem(): string | undefined {
  const path = signingKeyPath();
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8");
}

function publicKeyBase64FromPem(privateKeyPem: string): string {
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem));
  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

function parseSigningMetaRaw(raw: unknown): CompanyEventsSigningMetaV2 | undefined {
  const v2 = signingMetaV2Schema.safeParse(raw);
  if (v2.success) return v2.data;

  const v1 = signingMetaV1Schema.safeParse(raw);
  if (!v1.success) return undefined;

  const publicKey = v1.data.public_key;
  return {
    version: 2,
    purpose: "company_events_attestation",
    active: {
      key_id: deriveKeyId(publicKey),
      public_key: publicKey,
      activated_at: v1.data.rotated_at,
    },
    history: [],
  };
}

export function loadCompanyEventsSigningMeta(): CompanyEventsSigningMetaV2 | undefined {
  const path = signingMetaPath();
  if (!existsSync(path)) return undefined;
  const raw = readYamlFile(path, z.unknown());
  return parseSigningMetaRaw(raw);
}

export function saveCompanyEventsSigningMeta(meta: CompanyEventsSigningMetaV2): void {
  runWithEventsWriteGuard("company-events-signing-meta", () => {
    writeYamlFile(signingMetaPath(), meta);
  });
}

export function ensureCompanyEventsSigningKey(): string {
  const existing = loadCompanyEventsSigningKeyPem();
  if (existing) return existing;

  return runWithEventsWriteGuard("company-events-signing-key", () => {
    const path = signingKeyPath();
    mkdirSync(dirname(path), { recursive: true });
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    writeFileSync(path, privateKeyPem, { mode: 0o600 });
    const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const now = new Date().toISOString();
    saveCompanyEventsSigningMeta({
      version: 2,
      purpose: "company_events_attestation",
      active: {
        key_id: deriveKeyId(publicKeyBase64),
        public_key: publicKeyBase64,
        activated_at: now,
      },
      history: [],
    });
    return privateKeyPem;
  });
}

export function exportCompanyEventsPublicKeyBase64(): string | undefined {
  const meta = loadCompanyEventsSigningMeta();
  if (meta?.active.public_key) return meta.active.public_key;
  const privateKeyPem = loadCompanyEventsSigningKeyPem();
  if (!privateKeyPem) return undefined;
  return publicKeyBase64FromPem(privateKeyPem);
}

export function getTrustedAttestationPublicKeys(): string[] {
  const meta = loadCompanyEventsSigningMeta();
  if (!meta) return [];
  const keys = new Set<string>();
  keys.add(meta.active.public_key);
  for (const entry of meta.history) {
    keys.add(entry.public_key);
  }
  return [...keys];
}

export function getActiveSigningKeyId(): string | undefined {
  return loadCompanyEventsSigningMeta()?.active.key_id;
}

export interface RotateSigningKeyResult {
  previous_key_id: string;
  new_key_id: string;
  meta: CompanyEventsSigningMetaV2;
}

export function rotateCompanyEventsSigningKey(): RotateSigningKeyResult {
  return runWithEventsWriteGuard("company-events-signing-rotate", () => {
    const path = signingKeyPath();
    mkdirSync(dirname(path), { recursive: true });
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    writeFileSync(path, privateKeyPem, { mode: 0o600 });
    const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const now = new Date().toISOString();
    const newKeyId = deriveKeyId(publicKeyBase64);

    const existing = loadCompanyEventsSigningMeta();
    const previousKeyId = existing?.active.key_id ?? "none";
    const history: CompanyEventsSigningKeyEntry[] = [...(existing?.history ?? [])];
    if (existing?.active) {
      history.push({
        ...existing.active,
        retired_at: now,
      });
    }

    const meta: CompanyEventsSigningMetaV2 = {
      version: 2,
      purpose: "company_events_attestation",
      active: {
        key_id: newKeyId,
        public_key: publicKeyBase64,
        activated_at: now,
      },
      history,
    };
    saveCompanyEventsSigningMeta(meta);
    return { previous_key_id: previousKeyId, new_key_id: newKeyId, meta };
  });
}

export function migrateSigningMetaToV2(opts?: { dryRun?: boolean }): {
  migrated: boolean;
  meta?: CompanyEventsSigningMetaV2;
} {
  const path = signingMetaPath();
  if (!existsSync(path)) {
    ensureCompanyEventsSigningKey();
    return { migrated: true, meta: loadCompanyEventsSigningMeta() };
  }

  const raw = readYamlFile(path, z.unknown());
  const v2 = signingMetaV2Schema.safeParse(raw);
  if (v2.success) {
    return { migrated: false, meta: v2.data };
  }

  const parsed = parseSigningMetaRaw(raw);
  if (!parsed) {
    throw new Error("Invalid company-events-signing-meta.yaml — cannot migrate to v2");
  }
  if (!opts?.dryRun) {
    saveCompanyEventsSigningMeta(parsed);
  }
  return { migrated: true, meta: parsed };
}

export function digestAttestationPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function signAttestationPayload(
  payload: Record<string, unknown>,
  privateKeyPem?: string
): { payload_digest: string; signature: string; public_key: string; key_id: string } {
  const keyPem = privateKeyPem ?? ensureCompanyEventsSigningKey();
  const publicKey = exportCompanyEventsPublicKeyBase64();
  const keyId = getActiveSigningKeyId();
  if (!publicKey || !keyId) {
    throw new Error("Company events signing public key unavailable");
  }
  const payload_digest = digestAttestationPayload(payload);
  const digest = Buffer.from(payload_digest, "hex");
  const signature = sign(null, digest, createPrivateKey(keyPem)).toString("base64");
  return { payload_digest, signature, public_key: publicKey, key_id: keyId };
}

export function verifyAttestationSignature(input: {
  payload: Record<string, unknown>;
  payload_digest: string;
  signature: string;
  public_key: string;
  trusted_keys: string[];
}): boolean {
  if (!input.trusted_keys.includes(input.public_key)) {
    return false;
  }
  const expected = digestAttestationPayload(input.payload);
  if (expected !== input.payload_digest) return false;
  const digest = Buffer.from(input.payload_digest, "hex");
  const key = createPublicKey({
    key: Buffer.from(input.public_key, "base64"),
    format: "der",
    type: "spki",
  });
  return verify(null, digest, key, Buffer.from(input.signature, "base64"));
}
