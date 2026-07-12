#!/usr/bin/env node
/**
 * Phase 1 witness trust + org cert setup for MAL production (single process).
 */
import { readFileSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import {
  exportProtocolPublicKeyBase64,
  ensureProtocolSigningKey,
} from "../src/lib/protocol/signing.js";
import { getWitnessTrustAuthorityKeyPath } from "../src/lib/protocol/paths.js";
import {
  initWitnessTrustAuthority,
  certifyWitnessHub,
  addCertificateToBundle,
  publishWitnessTrustBundle,
  verifyWitnessTrustBundle,
  loadWitnessTrustAuthority,
  loadWitnessTrustBundle,
} from "../src/lib/protocol/witness-trust.js";
import { loadWitnessPoolConfig } from "../src/lib/protocol/witness-pool.js";
import { checkWitnessPoolHealth } from "../src/lib/protocol/witness-client.js";
import {
  organizationCertificateSpkiSha256,
  saveOrganizationCertificateAttestation,
  signOrganizationCertificateAttestation,
  verifyOrganizationCertificateAttestation,
} from "../src/lib/protocol/org-cert-witness.js";
import YAML from "yaml";

const TENANT = process.env.ORGOS_TENANT ?? "mal";
setTenantId(TENANT);

async function fetchHubKey(url: string): Promise<string> {
  const res = await fetch(`${url.replace(/\/$/, "")}/hub/v1/public-key`);
  if (!res.ok) throw new Error(`hub public key fetch failed: ${url} HTTP ${res.status}`);
  const body = (await res.json()) as { public_key?: string };
  if (!body.public_key) throw new Error(`hub public key missing: ${url}`);
  return body.public_key;
}

async function main(): Promise<void> {
  if (!loadWitnessTrustAuthority()) {
    initWitnessTrustAuthority({
      authorityId: "WTA-MAL",
      orgName: "MAL Witness Trust Authority",
      jurisdiction: "JP",
      orgUri: `steward://tenant/${TENANT}`,
    });
    console.log("✓ witness trust authority WTA-MAL initialized");
  } else {
    console.log("· witness trust authority already present");
  }

  for (const hub of [
    { id: "HUB-A", url: "http://127.0.0.1:9474" },
    { id: "HUB-B", url: "http://127.0.0.1:9475" },
  ]) {
    const hubPublicKey = await fetchHubKey(hub.url);
    const cert = certifyWitnessHub({
      hubId: hub.id,
      hubUrl: hub.url,
      hubPublicKey,
    });
    addCertificateToBundle(cert);
    console.log(`✓ certified ${hub.id}`);
  }

  const bundle = publishWitnessTrustBundle();
  const verify = verifyWitnessTrustBundle(bundle);
  if (!verify.ok) {
    throw new Error(`trust bundle verify failed: ${verify.issues.join(", ")}`);
  }
  console.log(`✓ trust bundle published · ${bundle.certificates.length} certificate(s)`);

  const gw = YAML.parse(readFileSync(`tenants/${TENANT}/data/protocol/wire-gateway.yaml`, "utf-8"));
  ensureProtocolSigningKey();
  const orgDid = gw.did;
  const pub = exportProtocolPublicKeyBase64();
  const authority = loadWitnessTrustAuthority();
  if (!authority) throw new Error("WTA missing after init");
  const privateKeyPem = readFileSync(getWitnessTrustAuthorityKeyPath(), "utf-8");
  const issued = new Date().toISOString();
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const attestation = signOrganizationCertificateAttestation(
    {
      version: "1",
      org_did: orgDid,
      spki_sha256: organizationCertificateSpkiSha256(pub)!,
      authority_id: authority.authority_id,
      issued_at: issued,
      expires_at: expires,
    },
    privateKeyPem
  );
  saveOrganizationCertificateAttestation(attestation);
  const orgVerify = verifyOrganizationCertificateAttestation(attestation);
  if (!orgVerify.ok) {
    throw new Error(`org cert verify failed: ${orgVerify.issues.join(", ")}`);
  }
  console.log("✓ organization certificate attestation saved and verified");

  const loaded = loadWitnessTrustBundle();
  if (!loaded) throw new Error("trust bundle missing on disk after publish");
  const reverify = verifyWitnessTrustBundle(loaded);
  if (!reverify.ok) throw new Error(`reload verify failed: ${reverify.issues.join(", ")}`);
  console.log(`✓ trust bundle reload verify OK · ${loaded.certificates.length} certificate(s)`);

  const pool = loadWitnessPoolConfig();
  const health = await checkWitnessPoolHealth(pool);
  for (const hub of health) {
    console.log(`  · ${hub.hub_id}: ${hub.ok ? "ok" : "fail"} (${hub.url})`);
  }
  if (!health.every((h) => h.ok)) throw new Error("witness pool health check failed");
  console.log("✓ witness pool health OK");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
