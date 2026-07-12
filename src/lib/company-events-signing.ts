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

const signingMetaSchema = z.object({
  rotated_at: z.string().min(1),
  public_key: z.string().min(1),
  purpose: z.literal("company_events_attestation"),
});

export type CompanyEventsSigningMeta = z.output<typeof signingMetaSchema>;

function signingKeyPath(): string {
  return join(getDataDir(), ".orgos", "company-events-signing.pem");
}

function signingMetaPath(): string {
  return join(getDataDir(), "company-events-signing-meta.yaml");
}

export function loadCompanyEventsSigningKeyPem(): string | undefined {
  const path = signingKeyPath();
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8");
}

export function ensureCompanyEventsSigningKey(): string {
  const existing = loadCompanyEventsSigningKeyPem();
  if (existing) return existing;
  const path = signingKeyPath();
  mkdirSync(dirname(path), { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  writeFileSync(path, privateKeyPem, { mode: 0o600 });
  const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  writeYamlFile(signingMetaPath(), {
    rotated_at: new Date().toISOString(),
    public_key: publicKeyBase64,
    purpose: "company_events_attestation",
  });
  return privateKeyPem;
}

export function loadCompanyEventsSigningMeta(): CompanyEventsSigningMeta | undefined {
  const path = signingMetaPath();
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, signingMetaSchema);
}

export function exportCompanyEventsPublicKeyBase64(): string | undefined {
  const meta = loadCompanyEventsSigningMeta();
  if (meta?.public_key) return meta.public_key;
  const privateKeyPem = loadCompanyEventsSigningKeyPem();
  if (!privateKeyPem) return undefined;
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem));
  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

export function digestAttestationPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function signAttestationPayload(
  payload: Record<string, unknown>,
  privateKeyPem?: string
): { payload_digest: string; signature: string; public_key: string } {
  const keyPem = privateKeyPem ?? ensureCompanyEventsSigningKey();
  const publicKey = exportCompanyEventsPublicKeyBase64();
  if (!publicKey) {
    throw new Error("Company events signing public key unavailable");
  }
  const payload_digest = digestAttestationPayload(payload);
  const digest = Buffer.from(payload_digest, "hex");
  const signature = sign(null, digest, createPrivateKey(keyPem)).toString("base64");
  return { payload_digest, signature, public_key: publicKey };
}

export function verifyAttestationSignature(input: {
  payload: Record<string, unknown>;
  payload_digest: string;
  signature: string;
  public_key: string;
}): boolean {
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
