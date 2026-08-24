/** Minimal CBOR decode/encode for WebAuthn attestation (maps · byte strings · ints). */

import { createHash } from "node:crypto";

export function decodeCbor(input: Buffer, offset = 0): { value: unknown; next: number } {
  const initial = input[offset];
  if (initial === undefined) throw new Error("cbor: unexpected end");

  const major = initial >> 5;
  const info = initial & 0x1f;

  if (major === 0) {
    const { length, next } = readAdditional(input, offset, info);
    return { value: length, next };
  }
  if (major === 1) {
    const { length, next } = readAdditional(input, offset, info);
    return { value: -1 - length, next };
  }
  if (major === 2) {
    const { length, next: lenNext } = readAdditional(input, offset, info);
    return { value: input.subarray(lenNext, lenNext + length), next: lenNext + length };
  }
  if (major === 3) {
    const { length, next: lenNext } = readAdditional(input, offset, info);
    return {
      value: input.subarray(lenNext, lenNext + length).toString("utf-8"),
      next: lenNext + length,
    };
  }
  if (major === 4) {
    const { length, next: lenNext } = readAdditional(input, offset, info);
    const items: unknown[] = [];
    let cursor = lenNext;
    for (let i = 0; i < length; i++) {
      const item = decodeCbor(input, cursor);
      items.push(item.value);
      cursor = item.next;
    }
    return { value: items, next: cursor };
  }
  if (major === 5) {
    const { length, next: lenNext } = readAdditional(input, offset, info);
    const map = new Map<unknown, unknown>();
    let cursor = lenNext;
    for (let i = 0; i < length; i++) {
      const key = decodeCbor(input, cursor);
      cursor = key.next;
      const val = decodeCbor(input, cursor);
      cursor = val.next;
      map.set(key.value, val.value);
    }
    return { value: map, next: cursor };
  }

  throw new Error(`cbor: unsupported major type ${major}`);
}

function readAdditional(input: Buffer, offset: number, info: number): { length: number; next: number } {
  if (info < 24) return { length: info, next: offset + 1 };
  if (info === 24) return { length: input[offset + 1]!, next: offset + 2 };
  if (info === 25) return { length: input.readUInt16BE(offset + 1), next: offset + 3 };
  if (info === 26) return { length: input.readUInt32BE(offset + 1), next: offset + 5 };
  throw new Error(`cbor: unsupported additional info ${info}`);
}

export function encodeCbor(value: unknown): Buffer {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return encodeUnsigned(value);
  }
  if (typeof value === "number" && Number.isInteger(value) && value < 0) {
    return encodeNegative(value);
  }
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf-8");
    return Buffer.concat([encodeMajor(3, bytes.length), bytes]);
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([encodeMajor(2, value.length), value]);
  }
  if (value instanceof Map) {
    const chunks: Buffer[] = [encodeMajor(5, value.size)];
    for (const [k, v] of value) {
      chunks.push(encodeCbor(k), encodeCbor(v));
    }
    return Buffer.concat(chunks);
  }
  if (Array.isArray(value)) {
    const chunks: Buffer[] = [encodeMajor(4, value.length)];
    for (const item of value) chunks.push(encodeCbor(item));
    return Buffer.concat(chunks);
  }
  throw new Error(`cbor: cannot encode ${typeof value}`);
}

function encodeMajor(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  if (length < 65536) {
    const buf = Buffer.alloc(3);
    buf[0] = (major << 5) | 25;
    buf.writeUInt16BE(length, 1);
    return buf;
  }
  const buf = Buffer.alloc(5);
  buf[0] = (major << 5) | 26;
  buf.writeUInt32BE(length, 1);
  return buf;
}

function encodeUnsigned(value: number): Buffer {
  return encodeMajor(0, value);
}

function encodeNegative(value: number): Buffer {
  return encodeMajor(1, -1 - value);
}

export function parseAttestationObject(attestationObjectBase64: string): {
  fmt: string;
  authData: Buffer;
  attStmt: Map<unknown, unknown>;
} {
  const decoded = decodeCbor(Buffer.from(attestationObjectBase64, "base64url"));
  if (!(decoded.value instanceof Map)) {
    throw new Error("attestationObject must be a CBOR map");
  }
  const fmt = decoded.value.get("fmt");
  const authData = decoded.value.get("authData");
  const attStmtRaw = decoded.value.get("attStmt");
  if (typeof fmt !== "string" || !Buffer.isBuffer(authData)) {
    throw new Error("attestationObject missing fmt or authData");
  }
  const attStmt =
    attStmtRaw instanceof Map ? attStmtRaw : new Map<unknown, unknown>();
  return { fmt, authData, attStmt };
}

export function extractCredentialFromAuthData(authData: Buffer): {
  credentialId: Buffer;
  cosePublicKey: Buffer;
  signCount: number;
} {
  if (authData.length < 37) throw new Error("authData too short");
  const flags = authData[32]!;
  if ((flags & 0x40) === 0) throw new Error("authData missing attested credential data");
  const signCount = authData.readUInt32BE(33);
  let offset = 37 + 16; // aaguid
  const credIdLen = authData.readUInt16BE(offset);
  offset += 2;
  const credentialId = authData.subarray(offset, offset + credIdLen);
  offset += credIdLen;
  const coseDecoded = decodeCbor(authData, offset);
  if (!Buffer.isBuffer(coseDecoded.value) && !(coseDecoded.value instanceof Map)) {
    throw new Error("invalid COSE public key");
  }
  const cosePublicKey = authData.subarray(offset, coseDecoded.next);
  return { credentialId, cosePublicKey, signCount };
}

/** COSE EC2 (P-256) → SPKI DER for Node crypto verify. */
export function coseEc2ToSpkiDer(coseKey: Buffer): Buffer | null {
  try {
    const decoded = decodeCbor(coseKey);
    if (!(decoded.value instanceof Map)) return null;
    const map = decoded.value;
    if (map.get(1) !== 2 || map.get(3) !== -7 || map.get(-1) !== 1) return null;
    const x = map.get(-2);
    const y = map.get(-3);
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) return null;
    const point = Buffer.concat([Buffer.from([0x04]), x, y]);
    const prefix = Buffer.from(
      "3059301306072a8648ce3d020106082a8648ce3d030107034200",
      "hex"
    );
    return Buffer.concat([prefix, point]);
  } catch {
    return null;
  }
}

export function buildCoseEc2PublicKey(publicKeySpkiDer: Buffer): Buffer {
  const point = publicKeySpkiDer.subarray(-65);
  const x = point.subarray(1, 33);
  const y = point.subarray(33, 65);
  return encodeCbor(
    new Map<number, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, x],
      [-3, y],
    ])
  );
}

export function buildRegistrationAuthData(
  rpId: string,
  credentialId: Buffer,
  cosePublicKey: Buffer
): Buffer {
  const rpIdHash = createHash("sha256").update(rpId).digest();
  const aaguid = Buffer.alloc(16, 0);
  const credLen = Buffer.alloc(2);
  credLen.writeUInt16BE(credentialId.length, 0);
  return Buffer.concat([
    rpIdHash,
    // AT (0x40) | UP (0x01) | UV (0x04)
    Buffer.from([0x45]),
    Buffer.from([0, 0, 0, 0]),
    aaguid,
    credLen,
    credentialId,
    cosePublicKey,
  ]);
}
