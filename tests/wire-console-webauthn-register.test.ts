import { describe, expect, it } from "vitest";
import {
  buildCoseEc2PublicKey,
  buildRegistrationAuthData,
  coseEc2ToSpkiDer,
  decodeCbor,
  encodeCbor,
  extractCredentialFromAuthData,
  parseAttestationObject,
} from "../src/lib/wire-console/auth/webauthn-cbor.js";
import { generateKeyPairSync } from "node:crypto";

describe("webauthn cbor", () => {
  it("round-trips attestationObject and extracts ES256 public key", () => {
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
    const coseKey = buildCoseEc2PublicKey(spki);
    const authData = buildRegistrationAuthData("localhost", Buffer.from("abc"), coseKey);
    const attestationObject = encodeCbor(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["authData", authData],
        ["attStmt", new Map()],
      ])
    );

    const parsed = parseAttestationObject(attestationObject.toString("base64url"));
    expect(parsed.fmt).toBe("none");
    const extracted = extractCredentialFromAuthData(parsed.authData);
    expect(extracted.credentialId.toString()).toBe("abc");
    const roundtripSpki = coseEc2ToSpkiDer(extracted.cosePublicKey);
    expect(roundtripSpki?.equals(spki)).toBe(true);
  });

  it("decodes CBOR maps with integer keys", () => {
    const encoded = encodeCbor(new Map<number, unknown>([[1, 2], [-1, 1]]));
    const decoded = decodeCbor(encoded);
    expect(decoded.value).toBeInstanceOf(Map);
  });
});
