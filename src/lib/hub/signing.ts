import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { WitnessReceipt } from "../../../schemas/protocol/witness-receipt.js";
import { canonicalJson } from "../protocol/canonical.js";
import { getHubSigningKeyPath } from "./paths.js";

export function generateHubKeyPair(): { publicKey: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function loadHubSigningKeyPem(): string | undefined {
  const path = getHubSigningKeyPath();
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8");
}

export function ensureHubSigningKey(): string {
  const existing = loadHubSigningKeyPem();
  if (existing) return existing;
  const path = getHubSigningKeyPath();
  mkdirSync(dirname(path), { recursive: true });
  const { privateKeyPem } = generateHubKeyPair();
  writeFileSync(path, privateKeyPem, { mode: 0o600 });
  return privateKeyPem;
}

export function exportHubPublicKeyBase64(): string {
  const privateKeyPem = ensureHubSigningKey();
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem));
  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

export function witnessReceiptDigest(receipt: Omit<WitnessReceipt, "hub_signature">): string {
  return createHash("sha256").update(canonicalJson(receipt)).digest("hex");
}

export function signWitnessReceipt(
  receipt: Omit<WitnessReceipt, "hub_signature">,
  privateKeyPem: string
): WitnessReceipt {
  const digest = Buffer.from(witnessReceiptDigest(receipt), "hex");
  const hub_signature = sign(null, digest, createPrivateKey(privateKeyPem)).toString("base64");
  return { ...receipt, hub_signature };
}

export function verifyWitnessReceiptSignature(
  receipt: WitnessReceipt,
  publicKeyBase64: string
): boolean {
  const { hub_signature, ...unsigned } = receipt;
  const digest = Buffer.from(witnessReceiptDigest(unsigned), "hex");
  const key = createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
  return verify(null, digest, key, Buffer.from(hub_signature, "base64"));
}
