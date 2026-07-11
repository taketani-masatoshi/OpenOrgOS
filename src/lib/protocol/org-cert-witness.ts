import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  organizationCertificateAttestationSchema,
  type OrganizationCertificateAttestation,
} from "../../../schemas/protocol/org-certificate-attestation.js";
import type { OpenOrgDid } from "../../../schemas/protocol/openorg-did.js";
import { canonicalJson } from "./canonical.js";
import { getWitnessTrustDir } from "./paths.js";
import {
  loadWitnessTrustBundle,
  verifyWitnessTrustBundle,
} from "./witness-trust.js";

export type UnsignedOrganizationCertificateAttestation = Omit<
  OrganizationCertificateAttestation,
  "authority_signature"
>;

export interface TrustedWitnessAuthority {
  authority_id: string;
  public_key: string;
}

function organizationCertificateAttestationPath(): string {
  return join(getWitnessTrustDir(), "organization-certificate-attestation.json");
}

/** SHA-256 hex of SPKI DER (organization signing key attestation). */
export function organizationCertificateSpkiSha256(protocolPublicKeyBase64: string): string | undefined {
  if (!protocolPublicKeyBase64.trim()) return undefined;
  try {
    const der = Buffer.from(protocolPublicKeyBase64, "base64");
    return createHash("sha256").update(der).digest("hex");
  } catch {
    return undefined;
  }
}

export function organizationCertificateAttestationDigest(
  attestation: UnsignedOrganizationCertificateAttestation
): string {
  return createHash("sha256").update(canonicalJson(attestation)).digest("hex");
}

export function signOrganizationCertificateAttestation(
  attestation: UnsignedOrganizationCertificateAttestation,
  authorityPrivateKeyPem: string
): OrganizationCertificateAttestation {
  const unsigned = organizationCertificateAttestationSchema
    .omit({ authority_signature: true })
    .parse(attestation);
  const digest = Buffer.from(organizationCertificateAttestationDigest(unsigned), "hex");
  const authority_signature = sign(
    null,
    digest,
    createPrivateKey(authorityPrivateKeyPem)
  ).toString("base64");
  return organizationCertificateAttestationSchema.parse({
    ...unsigned,
    authority_signature,
  });
}

function trustedAuthoritiesFromBundle(): TrustedWitnessAuthority[] {
  try {
    const bundle = loadWitnessTrustBundle();
    if (!bundle || !verifyWitnessTrustBundle(bundle).ok) return [];
    return [
      {
        authority_id: bundle.authority.authority_id,
        public_key: bundle.authority.public_key,
      },
    ];
  } catch {
    return [];
  }
}

export function verifyOrganizationCertificateAttestation(
  attestation: OrganizationCertificateAttestation,
  opts?: {
    authorities?: TrustedWitnessAuthority[];
    now?: Date;
  }
): { ok: boolean; issues: string[] } {
  const parsed = organizationCertificateAttestationSchema.safeParse(attestation);
  if (!parsed.success) {
    return { ok: false, issues: ["invalid attestation schema"] };
  }
  const value = parsed.data;
  const issues: string[] = [];
  const now = opts?.now ?? new Date();
  const issuedAt = new Date(value.issued_at);
  const expiresAt = new Date(value.expires_at);
  if (issuedAt.getTime() > now.getTime()) issues.push("attestation not yet valid");
  if (expiresAt.getTime() <= now.getTime()) issues.push("attestation expired");
  if (expiresAt.getTime() <= issuedAt.getTime()) {
    issues.push("expires_at must be after issued_at");
  }

  const authority = (opts?.authorities ?? trustedAuthoritiesFromBundle()).find(
    (candidate) => candidate.authority_id === value.authority_id
  );
  if (!authority) {
    issues.push(`unknown authority: ${value.authority_id}`);
    return { ok: false, issues };
  }

  try {
    const { authority_signature, ...unsigned } = value;
    const digest = Buffer.from(
      organizationCertificateAttestationDigest(unsigned),
      "hex"
    );
    const key = createPublicKey({
      key: Buffer.from(authority.public_key, "base64"),
      format: "der",
      type: "spki",
    });
    if (!verify(null, digest, key, Buffer.from(authority_signature, "base64"))) {
      issues.push("invalid authority_signature");
    }
  } catch {
    issues.push("invalid authority key or signature");
  }
  return { ok: issues.length === 0, issues };
}

export function saveOrganizationCertificateAttestation(
  attestation: OrganizationCertificateAttestation
): string {
  const parsed = organizationCertificateAttestationSchema.parse(attestation);
  mkdirSync(getWitnessTrustDir(), { recursive: true });
  const path = organizationCertificateAttestationPath();
  writeFileSync(path, JSON.stringify(parsed, null, 2), "utf-8");
  return path;
}

export function loadOrganizationCertificateAttestation():
  | OrganizationCertificateAttestation
  | undefined {
  const path = organizationCertificateAttestationPath();
  if (!existsSync(path)) return undefined;
  try {
    return organizationCertificateAttestationSchema.parse(
      JSON.parse(readFileSync(path, "utf-8"))
    );
  } catch {
    return undefined;
  }
}

/** True only for a current authority-signed attestation bound to this DID and SPKI. */
export function isOrganizationCertificateWitnessAnchored(
  protocolPublicKeyBase64: string,
  orgDid?: OpenOrgDid,
  opts?: {
    attestation?: OrganizationCertificateAttestation;
    authorities?: TrustedWitnessAuthority[];
    now?: Date;
  }
): boolean {
  const hash = organizationCertificateSpkiSha256(protocolPublicKeyBase64);
  if (!hash || !orgDid) return false;
  const attestation = opts?.attestation ?? loadOrganizationCertificateAttestation();
  if (!attestation) return false;
  if (attestation.org_did !== orgDid || attestation.spki_sha256 !== hash) return false;
  return verifyOrganizationCertificateAttestation(attestation, opts).ok;
}

/** Publish only an anchored hash; a self fingerprint is never an organization certificate. */
export function resolveOrganizationCertificateSpkiSha256(
  protocolPublicKeyBase64: string,
  orgDid?: OpenOrgDid
): string | undefined {
  if (!isOrganizationCertificateWitnessAnchored(protocolPublicKeyBase64, orgDid)) {
    return undefined;
  }
  return organizationCertificateSpkiSha256(protocolPublicKeyBase64);
}
