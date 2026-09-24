/**
 * Receipt digest and Ed25519 signature (canonical JSON of the receipt body).
 * Path: src/lib/receipt-qr/signature.ts
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import {
  receiptQrDataSchema,
  signedReceiptQrPayloadSchema,
  type ReceiptQrData,
  type SignedReceiptQrPayload,
} from "../../../schemas/receipt-qr.js";
import { canonicalJson } from "../protocol/canonical.js";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function receiptDigest(receipt: ReceiptQrData): string {
  return sha256Hex(canonicalJson(receiptQrDataSchema.parse(receipt)));
}

/** Base64 Ed25519 signature over the hex digest bytes. */
export function signReceiptDigest(digest: string, privateKey: KeyObject): string {
  return sign(null, Buffer.from(digest, "hex"), privateKey).toString("base64");
}

export function verifySignedReceiptPayload(raw: unknown): {
  ok: boolean;
  payload?: SignedReceiptQrPayload;
  reason?: string;
} {
  const parsed = signedReceiptQrPayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "schema_invalid" };
  const expectedDigest = sha256Hex(canonicalJson(parsed.data.receipt));
  if (expectedDigest !== parsed.data.digest)
    return { ok: false, reason: "digest_mismatch" };
  const publicKey = createPublicKey({
    key: Buffer.from(parsed.data.issuer_public_key, "base64"),
    format: "der",
    type: "spki",
  });
  const valid = verify(
    null,
    Buffer.from(parsed.data.digest, "hex"),
    publicKey,
    Buffer.from(parsed.data.signature, "base64"),
  );
  return valid
    ? { ok: true, payload: parsed.data }
    : { ok: false, reason: "signature_invalid" };
}

function signReceipt(
  receipt: ReceiptQrData,
  privateKey: KeyObject,
  publicKeySpkiBase64: string,
): SignedReceiptQrPayload {
  const parsed = receiptQrDataSchema.parse(receipt);
  const digest = receiptDigest(parsed);
  return signedReceiptQrPayloadSchema.parse({
    receipt: parsed,
    digest,
    signature: signReceiptDigest(digest, privateKey),
    issuer_public_key: publicKeySpkiBase64,
  });
}

/** Test helper: sign a receipt with an ephemeral Ed25519 key. */
export function signReceiptForTests(
  receipt: ReceiptQrData,
): SignedReceiptQrPayload {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return signReceipt(
    receipt,
    privateKey,
    publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  );
}

/** Re-sign with a known private key (base64 PKCS8) for fixtures. */
export function signReceiptWithKey(
  receipt: ReceiptQrData,
  privateKeyPkcs8Base64: string,
  publicKeySpkiBase64: string,
): SignedReceiptQrPayload {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8Base64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return signReceipt(receipt, privateKey, publicKeySpkiBase64);
}
