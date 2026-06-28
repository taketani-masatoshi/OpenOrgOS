/**
 * Proposal 3 — Org C (neutral relay + witness trust authority) bootstrap for inter-org demos.
 */

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getTenantDir } from "../../src/lib/tenant.js";
import { readYamlFile, writeYamlFile } from "../../src/lib/utils.js";
import { contractSchema } from "../../schemas/contract.js";
import { registerPeer } from "../../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../../src/lib/protocol/signing.js";
import {
  initWitnessTrustAuthority,
  certifyWitnessHub,
  addCertificateToBundle,
  publishWitnessTrustBundle,
  verifyWitnessTrustBundle,
} from "../../src/lib/protocol/witness-trust.js";
import { startProtocolApiServer } from "../../src/lib/protocol/protocol-api-server.js";
import { buildProtocolApiServerConfig } from "../../src/lib/protocol/protocol-api-config.js";
import { protocolFetch } from "../../src/lib/protocol/protocol-tls.js";
import { initWitnessPoolFromTrustBundle } from "../../src/lib/protocol/contract-witness-pool.js";
import { getWitnessTrustBundlePath } from "../../src/lib/protocol/paths.js";
import {
  ensureProposal3Pki,
  writeOrgCServerTlsMetadata,
  writePartyProtocolClientConfig,
  writeProposal3DeployEnv,
  type Proposal3PkiMaterial,
} from "../../src/lib/protocol/tls-pki.js";

export const ORG_C_API_PORT = Number(process.env.DEMO_ORG_C_API_PORT ?? 9486);
export const WTA_AUTHORITY_ID = "WTA-AIAC-001";

export interface OrgCHubKeys {
  hubAKey: string;
  hubBKey: string;
  hubAPort: number;
  hubBPort: number;
}

export interface OrgCInfrastructure {
  apiUrl: string;
  bundleUrl: string;
  relayEnqueueUrl: string;
  pki: Proposal3PkiMaterial;
  close: () => void;
}

function resetOrgCTrustState(tenantId: string): void {
  const trustDir = join(getTenantDir(tenantId), "data", "protocol", "witness-trust");
  const relayQueue = join(getTenantDir(tenantId), "data", "protocol", "wire-relay-queue.yaml");
  const relayStore = join(getTenantDir(tenantId), "data", "protocol", "relay-store");
  for (const p of [trustDir, relayQueue, relayStore]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

export async function startOrgCInfrastructure(
  orgCTenantId: string,
  hubs: OrgCHubKeys
): Promise<OrgCInfrastructure> {
  setTenantId(orgCTenantId);
  resetOrgCTrustState(orgCTenantId);
  ensureProtocolSigningKey();

  const pki = ensureProposal3Pki({ clients: ["mal", "southwood"] });
  writeOrgCServerTlsMetadata(orgCTenantId, pki);
  writeProposal3DeployEnv(orgCTenantId, pki);

  initWitnessTrustAuthority({
    authorityId: WTA_AUTHORITY_ID,
    orgName: "AIAC — Neutral Wire Operator",
    jurisdiction: "JP",
    orgUri: `steward://tenant/${orgCTenantId}`,
  });

  const certA = certifyWitnessHub({
    hubId: "HUB-A",
    hubUrl: `http://127.0.0.1:${hubs.hubAPort}`,
    hubPublicKey: hubs.hubAKey,
  });
  addCertificateToBundle(certA);
  const certB = certifyWitnessHub({
    hubId: "HUB-B",
    hubUrl: `http://127.0.0.1:${hubs.hubBPort}`,
    hubPublicKey: hubs.hubBKey,
  });
  addCertificateToBundle(certB);

  publishWitnessTrustBundle();

  const allowedOrgUris = Object.values(pki.clientCerts).map((c) => c.orgUri);
  const config = buildProtocolApiServerConfig({
    host: "127.0.0.1",
    port: ORG_C_API_PORT,
    tlsCert: pki.serverCertPath,
    tlsKey: pki.serverKeyPath,
    tlsCa: pki.caCertPath,
    mtlsRequired: true,
    mtlsAllowedOrgUris: allowedOrgUris,
  });

  const api = await startProtocolApiServer({
    config,
    tenantId: orgCTenantId,
    trustBundlePath: getWitnessTrustBundlePath(),
  });

  const bundleUrl = `${api.url}/protocol/v1/trust/bundle`;
  const bundleRes = await protocolFetch(bundleUrl, {
    tls: { ca_path: pki.caCertPath, reject_unauthorized: false },
  });
  const bundleCheck = verifyWitnessTrustBundle(await bundleRes.json());
  if (!bundleCheck.ok) {
    api.close();
    throw new Error(`Org C trust bundle verify failed: ${bundleCheck.issues.join("; ")}`);
  }

  console.log(`[${orgCTenantId}] ✓ Org C · trust bundle · ${bundleUrl} (HTTPS + mTLS)`);

  return {
    apiUrl: api.url,
    bundleUrl,
    relayEnqueueUrl: `${api.url}/protocol/v1/relay/enqueue`,
    pki,
    close: () => api.close(),
  };
}

export function patchContractForProposal3(
  tenantId: string,
  contractId: string,
  bundleUrl: string,
  orgCTenantId: string
): void {
  const path = join(getTenantDir(tenantId), "data", "contracts", `${contractId}.yaml`);
  if (!existsSync(path)) return;
  const contract = readYamlFile(path, contractSchema);
  writeYamlFile(path, {
    ...contract,
    protocol: {
      ...contract.protocol,
      peer_id: contract.protocol?.peer_id ?? (tenantId === "mal" ? "PEER-001" : undefined),
      resilience_sla: "gold",
      witness_trust_bundle_url: bundleUrl,
      witness_trust_authority_url: new URL(bundleUrl).origin,
      relay_org_uri: `steward://tenant/${orgCTenantId}`,
      witness_hubs: [{ hub_id: "HUB-A" }, { hub_id: "HUB-B" }],
    },
  });
}

export async function configurePartyForProposal3(opts: {
  tenantId: string;
  peerId: string;
  peerDisplayName: string;
  peerOrgUri: string;
  relayEnqueueUrl: string;
  bundleUrl: string;
  orgCTenantId: string;
  pki: Proposal3PkiMaterial;
  protocolPublicKey?: string;
}): Promise<void> {
  setTenantId(opts.tenantId);
  ensureProtocolSigningKey();
  writePartyProtocolClientConfig(opts.tenantId, opts.pki, {
    relayOrgUri: `steward://tenant/${opts.orgCTenantId}`,
  });
  registerPeer({
    peer_id: opts.peerId,
    display_name: opts.peerDisplayName,
    jurisdiction: "JP",
    org_uri: opts.peerOrgUri,
    protocol_public_key: opts.protocolPublicKey,
    inbound_endpoints: [
      {
        url: opts.relayEnqueueUrl,
        priority: 1,
        mode: "relay",
      },
    ],
  });
  await initWitnessPoolFromTrustBundle(opts.bundleUrl);
}
