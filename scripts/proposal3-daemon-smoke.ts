#!/usr/bin/env node
/**
 * Proposal 3 — 常駐デーモン smoke（Org C API + party relay 1 cycle）
 * Mac mini / CI 向け。24h 試験の事前ゲートとして使う。
 */
import { setTimeout as sleep } from "node:timers/promises";
import { setTenantId } from "../src/lib/tenant.js";
import {
  ensureProposal3Pki,
  writeOrgCServerTlsMetadata,
  writePartyProtocolClientConfig,
} from "../src/lib/protocol/tls-pki.js";
import { buildProtocolApiServerConfig } from "../src/lib/protocol/protocol-api-config.js";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";
import { getWitnessTrustBundlePath } from "../src/lib/protocol/paths.js";
import { protocolFetch } from "../src/lib/protocol/protocol-tls.js";
import { runProtocolRelayOnce } from "../src/commands/protocol.js";
import {
  initWitnessTrustAuthority,
  certifyWitnessHub,
  addCertificateToBundle,
  publishWitnessTrustBundle,
} from "../src/lib/protocol/witness-trust.js";
import { existsSync } from "node:fs";

const ORG_C = process.env.ORGOS_ORG_C_TENANT ?? "aiac";
const PORT = Number(process.env.DEMO_ORG_C_API_PORT ?? 9486);
const PARTIES = (process.env.PROPOSAL3_PARTIES ?? "mal,southwood").split(",");

async function ensureOrgCTrustBundle(orgCTenantId: string): Promise<void> {
  setTenantId(orgCTenantId);
  const bundlePath = getWitnessTrustBundlePath();
  if (existsSync(bundlePath)) return;
  initWitnessTrustAuthority({
    authorityId: "WTA-AIAC-001",
    orgName: "AIAC — Neutral Wire Operator",
    jurisdiction: "JP",
    orgUri: `steward://tenant/${orgCTenantId}`,
  });
  addCertificateToBundle(
    certifyWitnessHub({
      hubId: "HUB-A",
      hubUrl: "http://127.0.0.1:9474",
      hubPublicKey: "smoke-placeholder-key",
    })
  );
  publishWitnessTrustBundle();
}

async function main(): Promise<void> {
  console.log("Proposal 3 daemon smoke\n");

  const pki = ensureProposal3Pki({ clients: PARTIES });
  writeOrgCServerTlsMetadata(ORG_C, pki);
  for (const t of PARTIES) {
    writePartyProtocolClientConfig(t, pki, { relayOrgUri: `steward://tenant/${ORG_C}` });
  }

  setTenantId(ORG_C);
  await ensureOrgCTrustBundle(ORG_C);

  const allowedOrgUris = Object.values(pki.clientCerts).map((c) => c.orgUri);
  const api = await startProtocolApiServer({
    config: buildProtocolApiServerConfig({
      host: "127.0.0.1",
      port: PORT,
      tlsCert: pki.serverCertPath,
      tlsKey: pki.serverKeyPath,
      tlsCa: pki.caCertPath,
      mtlsRequired: true,
      mtlsAllowedOrgUris: allowedOrgUris,
    }),
    tenantId: ORG_C,
    trustBundlePath: getWitnessTrustBundlePath(),
  });

  try {
    const bundleUrl = `${api.url}/protocol/v1/trust/bundle`;
    const bundleRes = await protocolFetch(bundleUrl, {
      tls: { ca_path: pki.caCertPath, reject_unauthorized: false },
    });
    if (!bundleRes.ok) {
      throw new Error(`trust bundle HTTP ${bundleRes.status}`);
    }
    console.log(`✓ Org C API · ${bundleUrl}`);

    for (const tenantId of PARTIES) {
      setTenantId(tenantId);
      await runProtocolRelayOnce({ tenant: tenantId, noReconcile: true });
      console.log(`✓ relay once · ${tenantId}`);
    }

    setTenantId(PARTIES[0]!);
    const { runProtocolTlsVerify } = await import("../src/commands/protocol.js");
    await runProtocolTlsVerify({ url: bundleUrl });
    console.log("✓ tls verify");

    console.log("\n✓ daemon smoke OK — launchd 24h 試験へ進めます");
    console.log("  bash deploy/proposal3/launchd/install-macos.sh mal");
  } finally {
    api.close();
  }
}

await main();
