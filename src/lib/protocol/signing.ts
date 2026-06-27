import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { envelopeDigest } from "./canonical.js";
import { getProtocolSigningKeyPath } from "./paths.js";

export function generateProtocolKeyPair(): { publicKey: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function loadProtocolSigningKeyPem(): string | undefined {
  const path = getProtocolSigningKeyPath();
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8");
}

export function ensureProtocolSigningKey(): string {
  const existing = loadProtocolSigningKeyPem();
  if (existing) return existing;
  const path = getProtocolSigningKeyPath();
  mkdirSync(dirname(path), { recursive: true });
  const { privateKeyPem } = generateProtocolKeyPair();
  writeFileSync(path, privateKeyPem, { mode: 0o600 });
  return privateKeyPem;
}

export function signEventEnvelope(envelope: EventEnvelope, privateKeyPem: string): EventEnvelope {
  const digest = Buffer.from(envelopeDigest(envelope), "hex");
  const signature = sign(null, digest, createPrivateKey(privateKeyPem)).toString("base64");
  return { ...envelope, signature };
}

export function verifyEventEnvelopeSignature(
  envelope: EventEnvelope,
  publicKeyBase64: string
): boolean {
  if (!envelope.signature) return false;
  const digest = Buffer.from(envelopeDigest(envelope), "hex");
  const key = createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
  return verify(null, digest, key, Buffer.from(envelope.signature, "base64"));
}

export function exportProtocolPublicKeyBase64(): string | undefined {
  const privateKeyPem = loadProtocolSigningKeyPem();
  if (!privateKeyPem) return undefined;
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem));
  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

export function maybeSignEnvelope(envelope: EventEnvelope): EventEnvelope {
  const privateKeyPem = loadProtocolSigningKeyPem();
  if (!privateKeyPem) return envelope;
  return signEventEnvelope(envelope, privateKeyPem);
}

export function rotateProtocolSigningKey(): { publicKey: string; backupPath?: string } {
  const path = getProtocolSigningKeyPath();
  const existing = loadProtocolSigningKeyPem();
  let backupPath: string | undefined;
  if (existing) {
    backupPath = `${path}.bak-${Date.now()}`;
    writeFileSync(backupPath, existing, { mode: 0o600 });
  }
  const { privateKeyPem, publicKey } = generateProtocolKeyPair();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, privateKeyPem, { mode: 0o600 });
  return { publicKey, backupPath };
}
