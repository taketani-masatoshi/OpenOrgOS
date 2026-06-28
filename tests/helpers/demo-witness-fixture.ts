import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { EventEnvelope } from "../../schemas/protocol/org-event.js";
import { witnessPoolConfigSchema } from "../../schemas/protocol/witness-pool.js";
import { configureHubRuntime } from "../../src/lib/hub/runtime.js";
import { startHubServer } from "../../src/lib/hub-server.js";
import { exportHubPublicKeyBase64 } from "../../src/lib/hub/signing.js";
import { envelopeDigest } from "../../src/lib/protocol/canonical.js";
import { writeOutboxEnvelope } from "../../src/lib/protocol/audit-chain.js";
import { getProtocolOutboxDir, getWitnessPoolYamlPath } from "../../src/lib/protocol/paths.js";
import { runWithProtocolWriteGuard } from "../../src/lib/protocol/protocol-write-guard.js";
import { ensureProtocolSigningKey } from "../../src/lib/protocol/signing.js";
import { ROOT_DIR, setTenantId } from "../../src/lib/tenant.js";
import { writeYamlFile } from "../../src/lib/utils.js";

export const DEMO_WITNESS_EVENT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
export const DEMO_WITNESS_TENANT = "demo";

const HUB_A_DIR = join(ROOT_DIR, "scratch", "demo-witness-hub-a");
const HUB_B_DIR = join(ROOT_DIR, "scratch", "demo-witness-hub-b");
const HUB_A_PORT = 19490;
const HUB_B_PORT = 19491;

export function buildDemoWitnessEnvelope(tenantId: string): EventEnvelope {
  return {
    protocol_version: "1",
    event_id: DEMO_WITNESS_EVENT_ID,
    occurred_at: "2026-06-28T12:00:01.000Z",
    origin: {
      org_id: tenantId,
      org_uri: `steward://tenant/${tenantId}`,
    },
    destination: {
      org_id: "PEER-001",
      org_uri: "steward://tenant/peer",
    },
    correlation_id: "DEMO-WITNESS-001",
    identity: {
      org_ref: {
        org_id: tenantId,
        org_uri: `steward://tenant/${tenantId}`,
      },
    },
    event: {
      type: "org.transaction.recorded",
      payload: {
        transaction_id: "TX-DEMO-WITNESS-001",
        direction: "outbound",
        transaction_type: "steward.contract.execution.notice",
        counterparty: "PEER-001",
        refs: {
          contract_id: "CTR-099",
        },
        notes: "demo witness envelope",
        operator_attestation: {
          operator_id: "demo-seed",
          approver_id: "CEO",
          approved_at: "2026-06-28T12:00:01.000Z",
          basis: "existing_contract",
          basis_ref: "CTR-099",
          approval_tier: "A",
        },
      },
    },
  };
}

/** Writes outbox envelope for witness register; returns envelope digest for pending queue. */
export function seedDemoWitnessEnvelope(tenantId: string = DEMO_WITNESS_TENANT): string {
  setTenantId(tenantId);
  ensureProtocolSigningKey();
  const envelope = buildDemoWitnessEnvelope(tenantId);
  runWithProtocolWriteGuard("demo-witness-seed", () => {
    writeOutboxEnvelope(envelope, getProtocolOutboxDir());
  });
  return envelopeDigest(envelope);
}

/** Writes a second outbox envelope for wire delivery flush demos. */
export function seedDemoWireDeliveryEnvelope(
  tenantId: string = DEMO_WITNESS_TENANT,
  eventId: string = "b2c3d4e5-f6a7-8901-bcde-f12345678901"
): string {
  setTenantId(tenantId);
  ensureProtocolSigningKey();
  const envelope = { ...buildDemoWitnessEnvelope(tenantId), event_id: eventId };
  runWithProtocolWriteGuard("demo-wire-delivery-seed", () => {
    writeOutboxEnvelope(envelope, getProtocolOutboxDir());
  });
  return envelopeDigest(envelope);
}

export interface DemoWitnessHubs {
  close: () => void;
}

export async function startDemoWitnessHubs(
  tenantId: string = DEMO_WITNESS_TENANT
): Promise<DemoWitnessHubs> {
  setTenantId(tenantId);

  for (const dir of [HUB_A_DIR, HUB_B_DIR]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }

  configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A_DIR });
  const hubAKey = exportHubPublicKeyBase64();
  configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B_DIR });
  const hubBKey = exportHubPublicKeyBase64();

  const hubA = await startHubServer({
    hubId: "HUB-A",
    dataDir: HUB_A_DIR,
    host: "127.0.0.1",
    port: HUB_A_PORT,
  });
  const hubB = await startHubServer({
    hubId: "HUB-B",
    dataDir: HUB_B_DIR,
    host: "127.0.0.1",
    port: HUB_B_PORT,
  });

  writeYamlFile(
    getWitnessPoolYamlPath(),
    witnessPoolConfigSchema.parse({
      enabled: true,
      quorum: { mode: "any_of_n" },
      register_on: "both",
      hubs: [
        {
          hub_id: "HUB-A",
          hub_url: `http://127.0.0.1:${HUB_A_PORT}`,
          hub_public_key: hubAKey,
          priority: 1,
        },
        {
          hub_id: "HUB-B",
          hub_url: `http://127.0.0.1:${HUB_B_PORT}`,
          hub_public_key: hubBKey,
          priority: 2,
        },
      ],
    })
  );

  return {
    close: () => {
      hubA.close();
      hubB.close();
      for (const dir of [HUB_A_DIR, HUB_B_DIR]) {
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
