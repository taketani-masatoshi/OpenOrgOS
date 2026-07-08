import { createHash, createPrivateKey, sign, verify, createPublicKey } from "node:crypto";
import type { WitnessAttestation } from "../../../schemas/protocol/witness-attestation.js";
import { witnessAttestationSchema } from "../../../schemas/protocol/witness-attestation.js";
import { canonicalJson } from "./canonical.js";

export type UnsignedWitnessAttestation = Omit<WitnessAttestation, "org_signature">;

export function witnessAttestationDigest(attestation: UnsignedWitnessAttestation): string {
  return createHash("sha256").update(canonicalJson(attestation)).digest("hex");
}

export function signWitnessAttestation(
  attestation: UnsignedWitnessAttestation,
  privateKeyPem: string
): WitnessAttestation {
  const digest = Buffer.from(witnessAttestationDigest(attestation), "hex");
  const org_signature = sign(null, digest, createPrivateKey(privateKeyPem)).toString("base64");
  return witnessAttestationSchema.parse({ ...attestation, org_signature });
}

export function verifyWitnessAttestationSignature(attestation: WitnessAttestation): boolean {
  const { org_signature, ...unsigned } = attestation;
  const digest = Buffer.from(witnessAttestationDigest(unsigned), "hex");
  const key = createPublicKey({
    key: Buffer.from(attestation.org_public_key, "base64"),
    format: "der",
    type: "spki",
  });
  return verify(null, digest, key, Buffer.from(org_signature, "base64"));
}
