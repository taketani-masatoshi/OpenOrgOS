import {
  createHash,
  createPublicKey,
  createSign,
  generateKeyPairSync,
  randomBytes,
  type KeyObject,
  verify,
} from "node:crypto";
import {
  buildCoseEc2PublicKey,
  buildRegistrationAuthData,
  encodeCbor,
} from "./webauthn-cbor.js";

/** Verify WebAuthn assertion signature (ES256 / RS256 over authData || SHA256(clientDataJSON)). */
export function verifyWebAuthnAssertionSignature(opts: {
  publicKeySpkiBase64: string;
  authenticatorDataBase64: string;
  clientDataJsonBase64: string;
  signatureBase64: string;
}): boolean {
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(opts.publicKeySpkiBase64, "base64"),
      format: "der",
      type: "spki",
    });
    const clientDataHash = createHash("sha256")
      .update(Buffer.from(opts.clientDataJsonBase64, "base64url"))
      .digest();
    const authData = Buffer.from(opts.authenticatorDataBase64, "base64url");
    if (authData.length < 37) return false;
    const signedData = Buffer.concat([authData, clientDataHash]);
    const signature = Buffer.from(opts.signatureBase64, "base64url");
    const keyType = publicKey.asymmetricKeyType;
    if (keyType === "rsa") {
      return verify("RSA-SHA256", signedData, publicKey, signature);
    }
    if (keyType === "ec") {
      if (
        verify("sha256", signedData, { key: publicKey, dsaEncoding: "ieee-p1363" }, signature)
      ) {
        return true;
      }
      try {
        return verify("sha256", signedData, publicKey, signature);
      } catch {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function isWebAuthnTestSecretAllowed(): boolean {
  return (
    process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET === "1" ||
    process.env.VITEST === "true" ||
    process.env.NODE_ENV === "test"
  );
}

/** Build minimal authenticatorData for tests (UP|UV flags + rpIdHash). */
export function buildTestAuthenticatorData(rpId: string): Buffer {
  const rpIdHash = createHash("sha256").update(rpId).digest();
  // flags: UP (0x01) | UV (0x04) = 0x05 — required by verifyWebAuthnAssertion
  return Buffer.concat([rpIdHash, Buffer.from([0x05, 0, 0, 0, 0])]);
}

/** Mint signed WebAuthn assertion for vitest (ES256 P-256). */
export function mintTestWebAuthnAssertion(opts: {
  rpId: string;
  challenge: string;
  credentialId: string;
  origin?: string;
  privateKey?: KeyObject;
}): {
  credential_id: string;
  client_data_json: string;
  authenticator_data_base64: string;
  signature_base64: string;
  public_key_spki_base64: string;
} {
  let privateKey: KeyObject;
  let publicKeySpki: Buffer;
  if (opts.privateKey) {
    privateKey = opts.privateKey;
    publicKeySpki = createPublicKey(privateKey).export({ type: "spki", format: "der" }) as Buffer;
  } else {
    const generated = generateKeyPairSync("ec", { namedCurve: "P-256" });
    privateKey = generated.privateKey;
    publicKeySpki = generated.publicKey.export({ type: "spki", format: "der" }) as Buffer;
  }

  const clientDataJson = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge: opts.challenge,
      origin: opts.origin ?? `https://${opts.rpId}`,
    }),
    "utf-8"
  ).toString("base64url");
  const authData = buildTestAuthenticatorData(opts.rpId);
  const clientDataHash = createHash("sha256")
    .update(Buffer.from(clientDataJson, "base64url"))
    .digest();
  const signedData = Buffer.concat([authData, clientDataHash]);
  const signature = createSign("SHA256")
    .update(signedData)
    .sign({ key: privateKey, dsaEncoding: "ieee-p1363" });

  return {
    credential_id: opts.credentialId,
    client_data_json: clientDataJson,
    authenticator_data_base64: authData.toString("base64url"),
    signature_base64: signature.toString("base64url"),
    public_key_spki_base64: publicKeySpki.toString("base64"),
  };
}

/** Mint attestation for vitest registration (none · ES256 P-256). */
export function mintTestWebAuthnRegistration(opts: {
  rpId: string;
  challenge: string;
  origin?: string;
  operator_id?: string;
  approver_id?: string;
  privateKey?: KeyObject;
}): {
  credential_id: string;
  client_data_json: string;
  attestation_object_base64: string;
  public_key_spki_base64: string;
  operator_id: string;
  approver_id: string;
} {
  let privateKey: KeyObject;
  let publicKeySpki: Buffer;
  if (opts.privateKey) {
    privateKey = opts.privateKey;
    publicKeySpki = createPublicKey(privateKey).export({ type: "spki", format: "der" }) as Buffer;
  } else {
    const generated = generateKeyPairSync("ec", { namedCurve: "P-256" });
    privateKey = generated.privateKey;
    publicKeySpki = generated.publicKey.export({ type: "spki", format: "der" }) as Buffer;
  }

  const rawId = randomBytes(16);
  const credentialId = rawId.toString("base64url");
  const coseKey = buildCoseEc2PublicKey(publicKeySpki);
  const authData = buildRegistrationAuthData(opts.rpId, rawId, coseKey);
  const attestationObject = encodeCbor(
    new Map<string, unknown>([
      ["fmt", "none"],
      ["authData", authData],
      ["attStmt", new Map()],
    ])
  );

  const clientDataJson = Buffer.from(
    JSON.stringify({
      type: "webauthn.create",
      challenge: opts.challenge,
      origin: opts.origin ?? `https://${opts.rpId}`,
    }),
    "utf-8"
  ).toString("base64url");

  return {
    credential_id: credentialId,
    client_data_json: clientDataJson,
    attestation_object_base64: attestationObject.toString("base64url"),
    public_key_spki_base64: publicKeySpki.toString("base64"),
    operator_id: opts.operator_id ?? "Passkey Ops",
    approver_id: opts.approver_id ?? "テスト承認者",
  };
}
