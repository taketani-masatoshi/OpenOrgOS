import { createPublicKey, createVerify, X509Certificate } from "node:crypto";
import {
  coseEc2ToSpkiDer,
  extractCredentialFromAuthData,
} from "./webauthn-cbor.js";

const ES256_ALG = -7;

export type AttestationVerifyResult = { ok: true } | { ok: false; error: string };

/**
 * Verify registration attestation without PKIX trust anchors.
 * - `none`: accept (self-attestation implicit).
 * - `packed` self (no x5c): verify sig over authData with credential public key.
 * - `packed` with x5c: verify sig with leaf cert only (no chain trust — hybrid/platform).
 */
export function verifyRegistrationAttestation(opts: {
  fmt: string;
  authData: Buffer;
  attStmt: Map<unknown, unknown>;
}): AttestationVerifyResult {
  if (opts.fmt === "none") return { ok: true };
  if (opts.fmt !== "packed") {
    return { ok: false, error: `unsupported attestation format: ${opts.fmt}` };
  }

  const x5c = opts.attStmt.get("x5c");
  if (Array.isArray(x5c) && x5c.length > 0) {
    return verifyPackedCertAttestation(opts.authData, opts.attStmt);
  }
  return verifyPackedSelfAttestation(opts.authData, opts.attStmt);
}

function readPackedSignature(attStmt: Map<unknown, unknown>): AttestationVerifyResult | Buffer {
  const alg = attStmt.get("alg");
  const sig = attStmt.get("sig");
  if (alg !== ES256_ALG) {
    return { ok: false, error: "packed attestation alg must be ES256 (-7)" };
  }
  if (!Buffer.isBuffer(sig)) {
    return { ok: false, error: "packed attestation missing sig" };
  }
  return sig;
}

function verifySignatureOverAuthData(
  authData: Buffer,
  publicKeyDer: Buffer,
  sig: Buffer,
): AttestationVerifyResult {
  const verify = createVerify("SHA256");
  verify.update(authData);
  verify.end();
  const ok = verify.verify(
    { key: publicKeyDer, format: "der", type: "spki", dsaEncoding: "ieee-p1363" },
    sig,
  );
  return ok
    ? { ok: true }
    : { ok: false, error: "packed attestation signature invalid" };
}

function verifyPackedSelfAttestation(
  authData: Buffer,
  attStmt: Map<unknown, unknown>,
): AttestationVerifyResult {
  const sigOrErr = readPackedSignature(attStmt);
  if (!Buffer.isBuffer(sigOrErr)) return sigOrErr;

  let extracted: ReturnType<typeof extractCredentialFromAuthData>;
  try {
    extracted = extractCredentialFromAuthData(authData);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "invalid authenticator data",
    };
  }

  const spki = coseEc2ToSpkiDer(extracted.cosePublicKey);
  if (!spki) {
    return { ok: false, error: "unsupported credential public key (expected ES256 P-256)" };
  }

  return verifySignatureOverAuthData(authData, spki, sigOrErr);
}

function verifyPackedCertAttestation(
  authData: Buffer,
  attStmt: Map<unknown, unknown>,
): AttestationVerifyResult {
  const sigOrErr = readPackedSignature(attStmt);
  if (!Buffer.isBuffer(sigOrErr)) return sigOrErr;

  const x5c = attStmt.get("x5c");
  if (!Array.isArray(x5c) || x5c.length === 0 || !Buffer.isBuffer(x5c[0])) {
    return { ok: false, error: "packed attestation x5c missing leaf certificate" };
  }

  try {
    const leaf = new X509Certificate(x5c[0]);
    const spki = createPublicKey(leaf.publicKey).export({ type: "spki", format: "der" }) as Buffer;
    return verifySignatureOverAuthData(authData, spki, sigOrErr);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "invalid packed attestation certificate",
    };
  }
}
