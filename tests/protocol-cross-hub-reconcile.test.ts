import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, getDataDir, ROOT_DIR, writeYamlFile } from "../src/lib/utils.js";
import { reconcileCrossHub } from "../src/lib/protocol/witness-reconcile.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { startHubServer } from "../src/lib/hub-server.js";
import { exportHubPublicKeyBase64 } from "../src/lib/hub/signing.js";
import { registerHubAttestation } from "../src/lib/hub/receipt.js";
import { getWitnessPoolYamlPath, getTransactionsRegistryPath } from "../src/lib/protocol/paths.js";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";
import { transactionsRegistrySchema } from "../schemas/protocol/transaction-record.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "../src/lib/protocol/signing.js";
import { signWitnessAttestation } from "../src/lib/protocol/witness-attestation-crypto.js";
import { witnessAttestationSchema } from "../schemas/protocol/witness-attestation.js";

const HUB_A = join(ROOT_DIR, "scratch", "cross-reconcile-a");
const HUB_B = join(ROOT_DIR, "scratch", "cross-reconcile-b");
const EVENT_ID = "f1e2f3a4-b5c6-4789-a012-3456789abcde";

function cleanupProtocol(): void {
  const p = join(getDataDir(), "protocol");
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

function buildAttestation(side: "sent" | "received") {
  ensureProtocolSigningKey();
  const orgKey = exportProtocolPublicKeyBase64()!;
  const unsigned = {
    event_id: EVENT_ID,
    envelope_digest: "c".repeat(64),
    side,
    origin: { org_id: "mal" },
    destination: { org_id: "southwood" },
    transaction_type: "contract.execution.notice" as const,
    attested_at: new Date().toISOString(),
    org_ref: side === "sent" ? { org_id: "mal" } : { org_id: "southwood" },
    org_public_key: orgKey,
  };
  return signWitnessAttestation(unsigned, ensureProtocolSigningKey());
}

describe("cross-hub reconcile", () => {
  let serverA: { url: string; close: () => void };
  let serverB: { url: string; close: () => void };

  beforeEach(async () => {
    setTenantId("demo");
    cleanupProtocol();
    rmSync(HUB_A, { recursive: true, force: true });
    rmSync(HUB_B, { recursive: true, force: true });
    mkdirSync(HUB_A, { recursive: true });
    mkdirSync(HUB_B, { recursive: true });

    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A });
    const hubAKey = exportHubPublicKeyBase64();
    configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B });
    const hubBKey = exportHubPublicKeyBase64();

    serverA = await startHubServer({ hubId: "HUB-A", dataDir: HUB_A, host: "127.0.0.1", port: 0 });
    serverB = await startHubServer({ hubId: "HUB-B", dataDir: HUB_B, host: "127.0.0.1", port: 0 });

    mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
    writeYamlFile(
      getWitnessPoolYamlPath(),
      witnessPoolConfigSchema.parse({
        enabled: true,
        quorum: { mode: "any_of_n" },
        register_on: "both",
        hubs: [
          { hub_id: "HUB-A", hub_url: serverA.url, hub_public_key: hubAKey, priority: 1 },
          { hub_id: "HUB-B", hub_url: serverB.url, hub_public_key: hubBKey, priority: 2 },
        ],
      })
    );
    writeYamlFile(
      getTransactionsRegistryPath(),
      transactionsRegistrySchema.parse({
        transactions: [
          {
            transaction_id: "TX-20260626-001",
            event_id: EVENT_ID,
            direction: "outbound",
            transaction_type: "contract.execution.notice",
            our_org: { org_id: "demo", org_uri: "steward://tenant/demo" },
            counterparty: { org_id: "PEER-001", org_uri: "steward://tenant/peer" },
            refs: { contract_id: "CTR-001" },
            recorded_at: new Date().toISOString(),
          },
        ],
      })
    );
    writeFileSync(join(getDataDir(), "protocol", "audit-chain.jsonl"), "", "utf-8");

    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A });
    registerHubAttestation(witnessAttestationSchema.parse(buildAttestation("sent")));
    registerHubAttestation(witnessAttestationSchema.parse(buildAttestation("received")));

    configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B });
    registerHubAttestation(witnessAttestationSchema.parse(buildAttestation("sent")));
  });

  afterEach(() => {
    serverA.close();
    serverB.close();
    cleanupProtocol();
    rmSync(HUB_A, { recursive: true, force: true });
    rmSync(HUB_B, { recursive: true, force: true });
  });

  it("returns warning when witness pool disabled", async () => {
    setTenantId("demo");
    cleanupProtocol();
    const result = await reconcileCrossHub();
    expect(result.checked).toBe(0);
    expect(result.alerts.some((a) => a.code === "witness-disabled")).toBe(true);
  });

  it("detects hub-drift when hubs differ in attestation completeness", async () => {
    const result = await reconcileCrossHub({ eventId: EVENT_ID });
    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(result.alerts.some((a) => a.code === "hub-drift" || a.code === "partial-attestation")).toBe(
      true
    );
  });
});
