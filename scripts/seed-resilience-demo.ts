#!/usr/bin/env node
/**
 * OrgOS Resilience Stack demo — R1–R4
 * Org C trust authority · multipath wire · relay worker · SLA tiers
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getTenantDir, ROOT_DIR } from "../src/lib/tenant.js";
import { readYamlFile, writeYamlFile } from "../src/lib/utils.js";
import { contractSchema } from "../schemas/contract.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { startHubServer } from "../src/lib/hub-server.js";
import { exportHubPublicKeyBase64 } from "../src/lib/hub/signing.js";
import {
  initWitnessTrustAuthority,
  certifyWitnessHub,
  addCertificateToBundle,
  publishWitnessTrustBundle,
  verifyWitnessTrustBundle,
} from "../src/lib/protocol/witness-trust.js";
import { startProtocolApiServer } from "../src/lib/protocol/protocol-api-server.js";
import { initWitnessPoolFromTrustBundle } from "../src/lib/protocol/contract-witness-pool.js";
import { runRelayCycle } from "../src/lib/protocol/relay-worker.js";
import { getWitnessTrustBundlePath } from "../src/lib/protocol/paths.js";

const TRUST_TENANT = "ee-demo";
const ORG_A = "mal";
const ORG_B = "southwood";
const HUB_C_DIR = join(ROOT_DIR, "data", "hub-c-resilience");
const HUB_D_DIR = join(ROOT_DIR, "data", "hub-d-resilience");

async function resetHubDir(dir: string): Promise<void> {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

async function startHub(hubId: string, port: number, dataDir: string) {
  configureHubRuntime({ hubId, dataDir, gossipIntervalSec: 0 });
  const server = await startHubServer({ host: "127.0.0.1", port });
  const publicKey = exportHubPublicKeyBase64();
  return { server, publicKey, url: `http://127.0.0.1:${port}` };
}

function patchContractProtocol(tenantId: string, contractId: string, bundleUrl: string): void {
  const path = join(getTenantDir(tenantId), "data", "contracts", `${contractId}.yaml`);
  const contract = readYamlFile(path, contractSchema);
  writeYamlFile(path, {
    ...contract,
    protocol: {
      resilience_sla: "gold",
      witness_hubs: [{ hub_id: "HUB-C" }, { hub_id: "HUB-D" }],
      witness_trust_bundle_url: bundleUrl,
    },
  });
}

async function main(): Promise<void> {
  console.log("=== OrgOS Resilience Demo (R1–R4) ===\n");

  await resetHubDir(HUB_C_DIR);
  await resetHubDir(HUB_D_DIR);

  const hubC = await startHub("HUB-C", 9484, HUB_C_DIR);
  const hubD = await startHub("HUB-D", 9485, HUB_D_DIR);

  setTenantId(TRUST_TENANT);
  ensureProtocolSigningKey();
  initWitnessTrustAuthority({
    authorityId: "WTA-C-RESILIENCE",
    orgName: "Resilience Trust Org C",
    jurisdiction: "JP",
    orgUri: `steward://tenant/${TRUST_TENANT}`,
  });

  const certC = certifyWitnessHub({
    hubId: "HUB-C",
    hubUrl: hubC.url,
    hubPublicKey: hubC.publicKey,
  });
  addCertificateToBundle(certC);
  const certD = certifyWitnessHub({
    hubId: "HUB-D",
    hubUrl: hubD.url,
    hubPublicKey: hubD.publicKey,
  });
  addCertificateToBundle(certD);

  const api = await startProtocolApiServer({
    host: "127.0.0.1",
    port: 9486,
    trustBundlePath: getWitnessTrustBundlePath(),
  });
  publishWitnessTrustBundle();
  const bundleUrl = `${api.url}/protocol/v1/trust/bundle`;
  const bundleCheck = verifyWitnessTrustBundle(
    JSON.parse(
      await (await fetch(bundleUrl)).text()
    )
  );
  console.log(`✓ Org C trust bundle published · verify=${bundleCheck.ok}`);

  for (const tenant of [ORG_A, ORG_B]) {
    setTenantId(tenant);
    ensureProtocolSigningKey();
    if (existsSync(join(getTenantDir(tenant), "data", "contracts", "CTR-012.yaml"))) {
      patchContractProtocol(tenant, "CTR-012", bundleUrl);
    }
    await initWitnessPoolFromTrustBundle(bundleUrl);
    registerPeer({
      peer_id: tenant === ORG_A ? "PEER-001" : "PEER-001",
      display_name: tenant === ORG_A ? "Southwood" : "MAL",
      jurisdiction: "JP",
      org_uri: `steward://tenant/${tenant === ORG_A ? ORG_B : ORG_A}`,
      inbound_endpoints: [
        {
          url: `http://127.0.0.1:9473/steward/webhook`,
          priority: 1,
          mode: "push",
        },
        {
          url: `${api.url}/protocol/v1/relay/enqueue`,
          priority: 2,
          mode: "relay",
        },
      ],
    });
    const cycle = await runRelayCycle({ reconcile: false });
    console.log(`✓ ${tenant} relay cycle · wire_pending=${cycle.wire_pending}`);
  }

  console.log("\n=== Demo complete ===");
  console.log(`Trust bundle: ${bundleUrl}`);
  console.log("Hub C/D running · Protocol API on :9486");
  console.log("Stop with Ctrl+C");

  await new Promise<void>(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
