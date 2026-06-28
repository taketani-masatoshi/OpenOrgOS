#!/usr/bin/env node
/**
 * Seed demo tenant — Wire pending approval + Witness pending entry + outbox envelope.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { setTenantId, tenantDataPath } from "../src/lib/tenant.js";
import { proposeOrgApproval } from "../src/lib/org/approval/propose.js";
import { enqueueWitnessPending, saveWitnessPending } from "../src/lib/protocol/witness-queue.js";
import { enqueueWirePending, saveWirePending } from "../src/lib/protocol/wire-queue.js";
import { getWitnessPoolYamlPath } from "../src/lib/protocol/paths.js";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";
import { writeYamlFile } from "../src/lib/utils.js";
import { loadOrgApprovalRegistry, saveOrgApprovalRegistry } from "../src/lib/org/approval/registry.js";
import {
  DEMO_WITNESS_EVENT_ID,
  DEMO_WITNESS_TENANT,
  seedDemoWitnessEnvelope,
  seedDemoWireDeliveryEnvelope,
} from "../tests/helpers/demo-witness-fixture.js";

const DEMO_WIRE_DELIVERY_EVENT_ID = "b2c3d4e5-f6a7-8901-bcde-f12345678901";

const TENANT = DEMO_WITNESS_TENANT;

function resetDemoPending(): void {
  const registry = loadOrgApprovalRegistry();
  registry.approvals = registry.approvals.filter(
    (a) => !(a.scope === "wire" && a.status === "pending_approval")
  );
  saveOrgApprovalRegistry(registry);
  saveWitnessPending({ pending: [] });
  saveWirePending({ pending: [] });
}

function main(): void {
  setTenantId(TENANT);
  resetDemoPending();

  const peersDir = tenantDataPath("protocol");
  mkdirSync(peersDir, { recursive: true });
  writeFileSync(
    join(peersDir, "peers.yaml"),
    YAML.stringify({
      peers: [{ peer_id: "PEER-001", display_name: "Demo Partner Co.", jurisdiction: "JP" }],
    }),
    "utf-8"
  );

  writeYamlFile(
    getWitnessPoolYamlPath(),
    witnessPoolConfigSchema.parse({
      enabled: true,
      quorum: { mode: "any_of_n" },
      register_on: "both",
      hubs: [],
    })
  );

  const digest = seedDemoWitnessEnvelope(TENANT);
  const wireDigest = seedDemoWireDeliveryEnvelope(TENANT, DEMO_WIRE_DELIVERY_EVENT_ID);

  const approval = proposeOrgApproval({
    scope: "wire",
    subjectType: "wire.notice",
    proposedBy: "demo-seed",
    message: "デモ用 — 履行通知の送信承認依頼（CTR-099）",
    subjectRef: "CTR-099",
    wire: {
      peerId: "PEER-001",
      transactionType: "contract.execution.notice",
      contractId: "CTR-099",
    },
    useNoticeId: true,
  });

  enqueueWitnessPending({
    hub_id: "HUB-A",
    event_id: DEMO_WITNESS_EVENT_ID,
    side: "sent",
    envelope_digest: digest,
    last_error: "デモ — Witness 登録待ち（E2E hub 起動後に Register）",
  });

  enqueueWirePending({
    peer_id: "PEER-001",
    event_id: DEMO_WIRE_DELIVERY_EVENT_ID,
    envelope_digest: wireDigest,
    last_error: "デモ — Wire 配送待ち（Flush で再送）",
  });

  console.log(`✓ demo operator skeleton seeded`);
  console.log(`  tenant: ${TENANT}`);
  console.log(`  peer: PEER-001`);
  console.log(`  pending approval: ${approval.approval_id}`);
  console.log(`  witness pending: ${DEMO_WITNESS_EVENT_ID.slice(0, 8)}…`);
  console.log(`\n  export ORGOS_TENANT=demo`);
  console.log(`  orgos chat today`);
}

main();
