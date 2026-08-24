import { afterEach, describe, expect, it } from "vitest";
import { createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import {
  buildCoseEc2PublicKey,
  buildRegistrationAuthData,
  encodeCbor,
} from "../src/lib/wire-console/auth/webauthn-cbor.js";
import { verifyRegistrationAttestation } from "../src/lib/wire-console/auth/webauthn-attestation.js";

function buildPackedSelfAttestation(opts?: { tamperSig?: boolean }): {
  authData: Buffer;
  attStmt: Map<unknown, unknown>;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const coseKey = buildCoseEc2PublicKey(spki);
  const credentialId = randomBytes(16);
  const authData = buildRegistrationAuthData("localhost", credentialId, coseKey);

  const sign = createSign("SHA256");
  sign.update(authData);
  sign.end();
  let sig = sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }) as Buffer;
  if (opts?.tamperSig) {
    sig = Buffer.from(sig);
    sig[0] ^= 0xff;
  }

  return {
    authData,
    attStmt: new Map<unknown, unknown>([
      ["alg", -7],
      ["sig", sig],
    ]),
  };
}

describe("webauthn attestation", () => {
  afterEach(() => {
    /* stateless */
  });

  it("accepts fmt none without attStmt verification", () => {
    expect(
      verifyRegistrationAttestation({
        fmt: "none",
        authData: Buffer.from("x"),
        attStmt: new Map(),
      }),
    ).toEqual({ ok: true });
  });

  it("accepts valid packed self-attestation", () => {
    const { authData, attStmt } = buildPackedSelfAttestation();
    expect(
      verifyRegistrationAttestation({ fmt: "packed", authData, attStmt }),
    ).toEqual({ ok: true });
  });

  it("rejects packed self-attestation with invalid signature", () => {
    const { authData, attStmt } = buildPackedSelfAttestation({ tamperSig: true });
    const result = verifyRegistrationAttestation({ fmt: "packed", authData, attStmt });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/signature invalid/i);
  });

  it("rejects packed attestation with wrong alg", () => {
    const { authData, attStmt } = buildPackedSelfAttestation();
    attStmt.set("alg", -257);
    const result = verifyRegistrationAttestation({ fmt: "packed", authData, attStmt });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown attestation format", () => {
    const result = verifyRegistrationAttestation({
      fmt: "tpm",
      authData: Buffer.from("x"),
      attStmt: new Map(),
    });
    expect(result.ok).toBe(false);
  });

  it("round-trips attestationObject CBOR with attStmt map", () => {
    const { authData, attStmt } = buildPackedSelfAttestation();
    const attestationObject = encodeCbor(
      new Map<string, unknown>([
        ["fmt", "packed"],
        ["authData", authData],
        ["attStmt", attStmt],
      ]),
    );
    expect(attestationObject.length).toBeGreaterThan(0);
  });
});
