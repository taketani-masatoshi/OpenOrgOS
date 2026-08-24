import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { canonicalJson } from "../../protocol/canonical.js";

export interface Ed25519KeyPair {
  publicKey: string;
  privateKeyPem: string;
  keyId: string;
}

export function fsGuardKeyId(publicKeyBase64: string): string {
  return createHash("sha256").update(publicKeyBase64, "utf-8").digest("hex").slice(0, 16);
}

export function generateFsGuardKeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  return {
    publicKey: publicKeyBase64,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    keyId: fsGuardKeyId(publicKeyBase64),
  };
}

export function publicKeyFromPrivatePem(privateKeyPem: string): { publicKey: string; keyId: string } {
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem));
  const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  return { publicKey: publicKeyBase64, keyId: fsGuardKeyId(publicKeyBase64) };
}

export function digestUnsigned(value: unknown): Buffer {
  return createHash("sha256").update(canonicalJson(value)).digest();
}

export function signPayload(value: unknown, privateKeyPem: string): string {
  return sign(null, digestUnsigned(value), createPrivateKey(privateKeyPem)).toString("base64");
}

export function verifyPayload(value: unknown, signature: string, publicKeyBase64: string): boolean {
  const key = createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
  return verify(null, digestUnsigned(value), key, Buffer.from(signature, "base64"));
}

export function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
