import { createHash, createPrivateKey, sign, verify, createPublicKey } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  witnessTrustAuthoritySchema,
  witnessHubCertificateSchema,
  witnessTrustBundleSchema,
  type WitnessTrustAuthority,
  type WitnessHubCertificate,
  type WitnessTrustBundle,
} from "../../../schemas/protocol/witness-trust.js";
import { canonicalJson } from "./canonical.js";
import {
  getWitnessTrustAuthorityKeyPath,
  getWitnessTrustAuthorityYamlPath,
  getWitnessTrustBundlePath,
  getWitnessTrustDir,
} from "./paths.js";
import { readYamlFile, writeYamlFile } from "../utils.js";
import { generateHubKeyPair } from "../hub/signing.js";

export type UnsignedWitnessHubCertificate = Omit<WitnessHubCertificate, "authority_signature">;
export type UnsignedWitnessTrustBundle = Omit<WitnessTrustBundle, "bundle_signature">;

export function witnessHubCertificateDigest(cert: UnsignedWitnessHubCertificate): string {
  return createHash("sha256").update(canonicalJson(cert)).digest("hex");
}

export function signWitnessHubCertificate(
  cert: UnsignedWitnessHubCertificate,
  authorityPrivateKeyPem: string
): WitnessHubCertificate {
  const digest = Buffer.from(witnessHubCertificateDigest(cert), "hex");
  const authority_signature = sign(null, digest, createPrivateKey(authorityPrivateKeyPem)).toString(
    "base64"
  );
  return witnessHubCertificateSchema.parse({ ...cert, authority_signature });
}

export function verifyWitnessHubCertificate(
  cert: WitnessHubCertificate,
  authorityPublicKeyBase64: string
): boolean {
  const { authority_signature, ...unsigned } = cert;
  const digest = Buffer.from(witnessHubCertificateDigest(unsigned), "hex");
  const key = createPublicKey({
    key: Buffer.from(authorityPublicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
  return verify(null, digest, key, Buffer.from(authority_signature, "base64"));
}

export function witnessTrustBundleDigest(bundle: UnsignedWitnessTrustBundle): string {
  const payload = {
    version: bundle.version,
    authority_id: bundle.authority.authority_id,
    certificates: bundle.certificates.map((c) => witnessHubCertificateDigest(c)),
    published_at: bundle.published_at,
  };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function signWitnessTrustBundle(
  bundle: UnsignedWitnessTrustBundle,
  authorityPrivateKeyPem: string
): WitnessTrustBundle {
  const digest = Buffer.from(witnessTrustBundleDigest(bundle), "hex");
  const bundle_signature = sign(null, digest, createPrivateKey(authorityPrivateKeyPem)).toString(
    "base64"
  );
  return witnessTrustBundleSchema.parse({ ...bundle, bundle_signature });
}

export function verifyWitnessTrustBundle(bundle: WitnessTrustBundle): {
  ok: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const { bundle_signature, ...unsigned } = bundle;
  const digest = Buffer.from(witnessTrustBundleDigest(unsigned), "hex");
  const key = createPublicKey({
    key: Buffer.from(bundle.authority.public_key, "base64"),
    format: "der",
    type: "spki",
  });
  if (!verify(null, digest, key, Buffer.from(bundle_signature, "base64"))) {
    issues.push("invalid bundle_signature");
  }

  for (const cert of bundle.certificates) {
    if (cert.authority_id !== bundle.authority.authority_id) {
      issues.push(`${cert.hub_id}: authority_id mismatch`);
    }
    if (!verifyWitnessHubCertificate(cert, bundle.authority.public_key)) {
      issues.push(`${cert.hub_id}: invalid authority_signature`);
    }
    if (cert.expires_at && cert.expires_at < new Date().toISOString()) {
      issues.push(`${cert.hub_id}: certificate expired`);
    }
  }

  return { ok: issues.length === 0, issues };
}

export function ensureWitnessTrustAuthorityKey(): string {
  const path = getWitnessTrustAuthorityKeyPath();
  if (existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  mkdirSync(getWitnessTrustDir(), { recursive: true });
  const { privateKeyPem, publicKey } = generateHubKeyPair();
  writeFileSync(path, privateKeyPem, { mode: 0o600 });
  return privateKeyPem;
}

export function exportWitnessTrustAuthorityPublicKey(): string {
  const privateKeyPem = ensureWitnessTrustAuthorityKey();
  return createPublicKey(createPrivateKey(privateKeyPem))
    .export({ type: "spki", format: "der" })
    .toString("base64");
}

export function loadWitnessTrustAuthority(): WitnessTrustAuthority | undefined {
  const path = getWitnessTrustAuthorityYamlPath();
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, witnessTrustAuthoritySchema);
}

export function saveWitnessTrustAuthority(authority: WitnessTrustAuthority): void {
  mkdirSync(getWitnessTrustDir(), { recursive: true });
  writeYamlFile(getWitnessTrustAuthorityYamlPath(), authority);
}

export function initWitnessTrustAuthority(opts: {
  authorityId: string;
  orgName: string;
  jurisdiction: string;
  orgUri?: string;
}): WitnessTrustAuthority {
  ensureWitnessTrustAuthorityKey();
  const authority = witnessTrustAuthoritySchema.parse({
    authority_id: opts.authorityId,
    org_name: opts.orgName,
    org_uri: opts.orgUri,
    jurisdiction: opts.jurisdiction,
    public_key: exportWitnessTrustAuthorityPublicKey(),
    issued_at: new Date().toISOString(),
  });
  saveWitnessTrustAuthority(authority);
  return authority;
}

export function certifyWitnessHub(opts: {
  hubId: string;
  hubUrl: string;
  hubPublicKey: string;
  jurisdiction?: string;
  expiresAt?: string;
}): WitnessHubCertificate {
  const authority = loadWitnessTrustAuthority();
  if (!authority) {
    throw new Error("Witness trust authority not initialized — run witness trust init-authority");
  }
  const privateKeyPem = ensureWitnessTrustAuthorityKey();
  const unsigned: UnsignedWitnessHubCertificate = {
    cert_id: randomUUID(),
    hub_id: opts.hubId,
    hub_url: opts.hubUrl,
    hub_public_key: opts.hubPublicKey,
    jurisdiction: opts.jurisdiction ?? authority.jurisdiction,
    issued_at: new Date().toISOString(),
    expires_at: opts.expiresAt,
    authority_id: authority.authority_id,
  };
  return signWitnessHubCertificate(unsigned, privateKeyPem);
}

export function publishWitnessTrustBundle(): WitnessTrustBundle {
  const authority = loadWitnessTrustAuthority();
  if (!authority) {
    throw new Error("Witness trust authority not initialized");
  }
  const privateKeyPem = ensureWitnessTrustAuthorityKey();
  const existing = loadWitnessTrustBundle();
  const unsigned: UnsignedWitnessTrustBundle = {
    version: "1",
    authority,
    certificates: existing?.certificates ?? [],
    published_at: new Date().toISOString(),
  };
  const bundle = signWitnessTrustBundle(unsigned, privateKeyPem);
  mkdirSync(getWitnessTrustDir(), { recursive: true });
  writeFileSync(getWitnessTrustBundlePath(), JSON.stringify(bundle, null, 2), "utf-8");
  return bundle;
}

export function loadWitnessTrustBundle(): WitnessTrustBundle | undefined {
  const path = getWitnessTrustBundlePath();
  if (!existsSync(path)) return undefined;
  return witnessTrustBundleSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function addCertificateToBundle(cert: WitnessHubCertificate): WitnessTrustBundle {
  const bundle = loadWitnessTrustBundle();
  const certs = (bundle?.certificates ?? []).filter((c) => c.hub_id !== cert.hub_id);
  certs.push(cert);
  const authority = loadWitnessTrustAuthority();
  if (!authority) throw new Error("Witness trust authority not initialized");
  const privateKeyPem = ensureWitnessTrustAuthorityKey();
  const signed = signWitnessTrustBundle(
    {
      version: "1",
      authority,
      certificates: certs,
      published_at: new Date().toISOString(),
    },
    privateKeyPem
  );
  writeFileSync(getWitnessTrustBundlePath(), JSON.stringify(signed, null, 2), "utf-8");
  return signed;
}

export async function fetchWitnessTrustBundle(
  url: string,
  tls?: import("../../../schemas/protocol/protocol-api-config.js").ProtocolTlsCredentials
): Promise<WitnessTrustBundle> {
  const { loadProtocolApiClientConfig, mergeTlsCredentials } = await import("./protocol-api-config.js");
  const { protocolFetch } = await import("./protocol-tls.js");
  const client = loadProtocolApiClientConfig();
  const useTls = url.startsWith("https://") ? mergeTlsCredentials(client.tls, tls) : undefined;
  const res = await protocolFetch(url, { tls: useTls });
  if (!res.ok) {
    throw new Error(`Failed to fetch trust bundle: HTTP ${res.status}`);
  }
  return witnessTrustBundleSchema.parse(await res.json());
}

export function verifiedHubsFromBundle(bundle: WitnessTrustBundle): WitnessHubCertificate[] {
  const { ok, issues } = verifyWitnessTrustBundle(bundle);
  if (!ok) {
    throw new Error(`Trust bundle verification failed: ${issues.join("; ")}`);
  }
  return bundle.certificates;
}
