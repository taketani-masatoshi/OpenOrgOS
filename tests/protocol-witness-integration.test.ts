import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, ROOT_DIR, writeYamlFile } from "../src/lib/utils.js";
import { getDataDir, getDocsDir } from "../src/lib/utils.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { startHubServer } from "../src/lib/hub-server.js";
import { exportHubPublicKeyBase64 } from "../src/lib/hub/signing.js";
import { getWitnessPoolYamlPath } from "../src/lib/protocol/paths.js";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import { proposeInterOrgNotice, approveInterOrgNotice } from "../src/lib/wire/index.js";
import { ensureProtocolSigningKey } from "../src/lib/protocol/signing.js";
import { registerWitnessAttestationFanOut, verifyCachedReceiptsForEvent } from "../src/lib/protocol/witness-client.js";
import { loadProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import { loadEnvelopesFromDirectories } from "../src/lib/protocol/external-verify.js";
import { getProtocolOutboxDir } from "../src/lib/protocol/paths.js";

const HUB_A_DIR = join(ROOT_DIR, "scratch", "witness-int-hub-a");
const HUB_B_DIR = join(ROOT_DIR, "scratch", "witness-int-hub-b");

function cleanup(): void {
  for (const p of [join(getDataDir(), "protocol"), join(getDocsDir(), "protocol")]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

describe("protocol witness integration", () => {
  let hubA: { close: () => void };
  let hubB: { close: () => void };

  beforeEach(async () => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "contracts"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "contracts", "CTR-099.yaml"),
      `id: CTR-099
name: Office lease
counterparty: Peer Co
type: rental
status: executed
start_date: "2026-01-01"
executed_date: "2026-01-15"
monthly_cost: 85000
`,
      "utf-8"
    );

    rmSync(HUB_A_DIR, { recursive: true, force: true });
    rmSync(HUB_B_DIR, { recursive: true, force: true });
    mkdirSync(HUB_A_DIR, { recursive: true });
    mkdirSync(HUB_B_DIR, { recursive: true });

    configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A_DIR });
    const hubAKey = exportHubPublicKeyBase64();
    configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B_DIR });
    const hubBKey = exportHubPublicKeyBase64();

    hubA = await startHubServer({ hubId: "HUB-A", dataDir: HUB_A_DIR, host: "127.0.0.1", port: 19478 });
    hubB = await startHubServer({ hubId: "HUB-B", dataDir: HUB_B_DIR, host: "127.0.0.1", port: 19479 });

    writeYamlFile(
      getWitnessPoolYamlPath(),
      witnessPoolConfigSchema.parse({
        enabled: true,
        quorum: { mode: "any_of_n" },
        register_on: "both",
        hubs: [
          { hub_id: "HUB-A", hub_url: "http://127.0.0.1:19478", hub_public_key: hubAKey, priority: 1 },
          { hub_id: "HUB-B", hub_url: "http://127.0.0.1:19479", hub_public_key: hubBKey, priority: 2 },
        ],
      })
    );

    registerPeer({ peer_id: "PEER-001", display_name: "Peer", jurisdiction: "JP" });
    ensureProtocolSigningKey();
  });

  afterEach(() => {
    hubA.close();
    hubB.close();
    cleanup();
    rmSync(HUB_A_DIR, { recursive: true, force: true });
    rmSync(HUB_B_DIR, { recursive: true, force: true });
  });

  it("mal-style flow: sent + received attestation yields mutually_confirmed quorum", async () => {
    const notice = proposeInterOrgNotice({
      peerId: "PEER-001",
      contractId: "CTR-099",
      proposedBy: "ops",
    });
    const { transmission } = approveInterOrgNotice({
      noticeId: notice.notice_id,
      approverId: "DemoCEO",
    });

    const wireEnvelope = {
      ...transmission.envelope,
      destination: transmission.envelope.origin,
    };

    const sent = await registerWitnessAttestationFanOut({
      envelope: wireEnvelope,
      side: "sent",
    });
    expect(sent!.succeeded.length).toBe(2);

    const received = await registerWitnessAttestationFanOut({
      envelope: wireEnvelope,
      side: "received",
    });
    expect(received!.succeeded.length).toBe(2);
    expect(received!.quorum.satisfied).toBe(true);

    const verify = verifyCachedReceiptsForEvent(transmission.envelope.event_id);
    expect(verify.quorum.satisfied).toBe(true);
    expect(verify.receipts.some((r) => r.status === "mutually_confirmed")).toBe(true);

    const chain = loadProtocolAuditChain();
    const outbox = loadEnvelopesFromDirectories([getProtocolOutboxDir()]);
    const witnessTypes = chain
      .map((r) => outbox.get(r.event_id)?.event.type)
      .filter((t): t is string => !!t && t.startsWith("org.witness."));
    expect(witnessTypes).toContain("org.witness.attestation.registered");
    expect(witnessTypes).toContain("org.witness.receipt.issued");
  });
});
