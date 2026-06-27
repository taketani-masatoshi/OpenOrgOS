#!/usr/bin/env node
/**
 * Inter-org protocol デモ — operator propose → approver approve → peer inbound ack · witness pool
 */

import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId, ROOT_DIR, getTenantDir } from "../src/lib/tenant.js";
import { readYamlFile, writeYamlFile } from "../src/lib/utils.js";
import { contractSchema } from "../schemas/contract.js";
import { registerPeer } from "../src/lib/protocol/peers.js";
import {
  proposeInterOrgNotice,
  proposeInterOrgAck,
  approveInterOrgNotice,
} from "../src/lib/wire/index.js";
import { buildIdentityDocument, buildIdentityEnvelope } from "../src/lib/protocol/identity.js";
import { exportDelegationProof, buildDelegationEnvelope } from "../src/lib/protocol/delegation.js";
import { resolveJurisdictionApprovalPolicy } from "../src/lib/jurisdiction/wire-governance/index.js";
import { validateProtocolState } from "../src/lib/protocol/validate.js";
import { verifyProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import { serializeEventEnvelope } from "../src/lib/protocol/envelope.js";
import { getProtocolOutboxDir } from "../src/lib/protocol/paths.js";
import { loadCompany } from "../src/lib/data.js";
import { ensureProtocolSigningKey, exportProtocolPublicKeyBase64 } from "../src/lib/protocol/signing.js";
import { ingestWebhook } from "../src/lib/webhook.js";
import { configureHubRuntime } from "../src/lib/hub/runtime.js";
import { startHubServer } from "../src/lib/hub-server.js";
import { exportHubPublicKeyBase64 } from "../src/lib/hub/signing.js";
import { getWitnessPoolYamlPath } from "../src/lib/protocol/paths.js";
import { witnessPoolConfigSchema } from "../schemas/protocol/witness-pool.js";
import { registerWitnessAttestationFanOut } from "../src/lib/protocol/witness-client.js";
import { hubFederationSchema } from "../schemas/protocol/hub-federation.js";
import { syncFromPeer } from "../src/lib/hub/gossip-sync.js";
import { findHubReceiptByEventId } from "../src/lib/hub/receipt.js";
import { loadHubAttestations } from "../src/lib/hub/registry.js";
import type { EventEnvelope } from "../schemas/protocol/org-event.js";

const HUB_A_DIR = join(ROOT_DIR, "data", "hub-a");
const HUB_B_DIR = join(ROOT_DIR, "data", "hub-b");

const DEMO_EVENT_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
const MAL_TENANT = "mal";
const VENDOR_TENANT = "southwood";
const VENDOR_LEGAL_NAME = "株式会社サウスウッド";

function protocolDir(tenantId: string): string {
  return join(getTenantDir(tenantId), "data", "protocol");
}

function resetProtocolState(tenantId: string): void {
  const base = protocolDir(tenantId);
  const outbox = join(getTenantDir(tenantId), "docs", "protocol", "outbox");
  for (const p of [base, outbox]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function ensureCtr012Executed(): void {
  setTenantId(MAL_TENANT);
  const path = join(getTenantDir(MAL_TENANT), "data", "contracts", "CTR-012.yaml");
  const contract = readYamlFile(path, contractSchema);
  const baseNotes = (contract.notes ?? "")
    .split("\n")
    .filter((line) => !line.includes("[protocol demo]"))
    .join("\n")
    .trim();
  writeYamlFile(path, {
    ...contract,
    status: "executed",
    executed_date: "2026-06-25",
    counterparty: VENDOR_LEGAL_NAME,
    documents: {
      ...contract.documents,
      executed: "docs/contracts/CTR-012/02-executed.md",
    },
    notes: `${baseNotes}\n[protocol demo] executed for inter-org demo · peer ${VENDOR_TENANT}`.trim(),
  });
}

function writeOutboxCopy(filename: string, envelope: unknown): string {
  const dir = getProtocolOutboxDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, serializeEventEnvelope(envelope as Parameters<typeof serializeEventEnvelope>[0]), "utf-8");
  return path;
}

function writeWitnessPool(tenantId: string, hubAKey: string, hubBKey: string): void {
  setTenantId(tenantId);
  writeYamlFile(
    getWitnessPoolYamlPath(),
    witnessPoolConfigSchema.parse({
      enabled: true,
      quorum: { mode: "any_of_n" },
      register_on: "both",
      hubs: [
        {
          hub_id: "HUB-A",
          hub_url: "http://127.0.0.1:9474",
          hub_public_key: hubAKey,
          priority: 1,
        },
        {
          hub_id: "HUB-B",
          hub_url: "http://127.0.0.1:9475",
          hub_public_key: hubBKey,
          priority: 2,
        },
      ],
    })
  );
}

function writeHubFederation(
  dataDir: string,
  hubId: string,
  peers: Array<{ hub_id: string; hub_url: string; hub_public_key: string }>
): void {
  configureHubRuntime({ hubId, dataDir });
  writeYamlFile(
    join(dataDir, "hub-federation.yaml"),
    hubFederationSchema.parse({
      hub_id: hubId,
      gossip: { enabled: true, interval_sec: 300 },
      hub_peers: peers.map((p, i) => ({ ...p, priority: i + 1 })),
    })
  );
}

async function startDemoWitnessHubs(): Promise<{
  hubAKey: string;
  hubBKey: string;
  close: () => void;
}> {
  for (const d of [HUB_A_DIR, HUB_B_DIR]) {
    rmSync(d, { recursive: true, force: true });
    mkdirSync(d, { recursive: true });
  }
  configureHubRuntime({ hubId: "HUB-A", dataDir: HUB_A_DIR });
  const hubAKey = exportHubPublicKeyBase64();
  configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B_DIR });
  const hubBKey = exportHubPublicKeyBase64();
  const hubA = await startHubServer({ hubId: "HUB-A", dataDir: HUB_A_DIR, port: 9474 });
  const hubB = await startHubServer({ hubId: "HUB-B", dataDir: HUB_B_DIR, port: 9475 });
  writeHubFederation(HUB_A_DIR, "HUB-A", [
    { hub_id: "HUB-B", hub_url: "http://127.0.0.1:9475", hub_public_key: hubBKey },
  ]);
  writeHubFederation(HUB_B_DIR, "HUB-B", [
    { hub_id: "HUB-A", hub_url: "http://127.0.0.1:9474", hub_public_key: hubAKey },
  ]);
  return {
    hubAKey,
    hubBKey,
    close: () => {
      hubA.close();
      hubB.close();
    },
  };
}

async function seedMalSide(
  sharedEventId: string,
  hubAKey: string,
  hubBKey: string
): Promise<{ path: string; envelope: EventEnvelope }> {
  setTenantId(MAL_TENANT);
  resetProtocolState(MAL_TENANT);
  ensureProtocolSigningKey();

  registerPeer({
    peer_id: "PEER-001",
    display_name: VENDOR_LEGAL_NAME,
    jurisdiction: "JP",
    stakeholder_id: "STK-001",
    org_uri: `steward://tenant/${VENDOR_TENANT}`,
  });

  const identityDoc = buildIdentityDocument({ omitCorporateNumber: false });
  writeOutboxCopy(
    "01-mal-identity-presented.json",
    buildIdentityEnvelope(identityDoc, {
      org_id: "PEER-001",
      org_uri: `steward://tenant/${VENDOR_TENANT}`,
    })
  );

  const delegationProof = exportDelegationProof({
    scope: "contract.sign",
    granteeAgent: "contract",
    basisRef: resolveJurisdictionApprovalPolicy().policy_ref,
  });
  writeOutboxCopy(
    "02-mal-delegation-contract-sign.json",
    buildDelegationEnvelope(delegationProof, {
      org_id: "PEER-001",
      org_uri: `steward://tenant/${VENDOR_TENANT}`,
    })
  );

  const company = loadCompany();
  const notice = proposeInterOrgNotice({
    peerId: "PEER-001",
    contractId: "CTR-012",
    proposedBy: "秘書オペレータ",
    message: "CTR-012 オフィス賃貸借に基づき、契約通りの運用・請求サイクルを開始します。",
  });

  const { transmission } = approveInterOrgNotice({
    noticeId: notice.notice_id,
    approverId: company.representative?.split("、")[0] ?? "段燕燕",
    eventId: sharedEventId,
  });

  writeOutboxCopy("03-mal-execution-notice.json", transmission.envelope);

  writeWitnessPool(MAL_TENANT, hubAKey, hubBKey);
  const witnessSent = await registerWitnessAttestationFanOut({
    envelope: transmission.envelope,
    side: "sent",
  });
  if (witnessSent) {
    console.log(
      `[mal] witness sent: ${witnessSent.succeeded.length}/${witnessSent.succeeded.length + witnessSent.failed.length} hubs · quorum ${witnessSent.quorum.satisfied ? "ok" : "pending"}`
    );
  }

  const v = validateProtocolState();
  if (!v.ok) {
    throw new Error(`mal protocol validate failed: ${v.issues.map((i) => i.message).join("; ")}`);
  }
  const audit = verifyProtocolAuditChain({
    envelopesByEventId: new Map([[transmission.envelope.event_id, transmission.envelope]]),
  });
  if (!audit.ok) {
    throw new Error(`mal audit verify failed: ${audit.issues.map((i) => i.message).join("; ")}`);
  }

  console.log(
    `[mal] ✓ ${notice.notice_id} approved → ${transmission.transaction.transaction_id} · operator+CEO gate`
  );
  return {
    path: join(getProtocolOutboxDir(), "03-mal-execution-notice.json"),
    envelope: transmission.envelope,
  };
}

async function seedVendorSide(
  sharedEventId: string,
  malNoticePath: string,
  hubAKey: string,
  hubBKey: string,
  malEnvelope: unknown
): Promise<void> {
  setTenantId(VENDOR_TENANT);
  resetProtocolState(VENDOR_TENANT);
  ensureProtocolSigningKey();

  setTenantId(MAL_TENANT);
  ensureProtocolSigningKey();
  const malPublicKey = exportProtocolPublicKeyBase64();
  setTenantId(VENDOR_TENANT);
  if (!malPublicKey) {
    throw new Error("mal protocol public key not available");
  }

  registerPeer({
    peer_id: "PEER-002",
    display_name: "株式会社MAL",
    jurisdiction: "JP",
    org_uri: `steward://tenant/${MAL_TENANT}`,
    protocol_public_key: malPublicKey,
  });

  const identityDoc = buildIdentityDocument({ omitCorporateNumber: true });
  writeOutboxCopy(
    "01-vendor-identity-presented.json",
    buildIdentityEnvelope(identityDoc, {
      org_id: "PEER-002",
      org_uri: `steward://tenant/${MAL_TENANT}`,
    })
  );

  const ingest = ingestWebhook({
    raw: JSON.parse(readFileSync(malNoticePath, "utf-8")),
  });
  if (!ingest.ok || !ingest.transactionId) {
    throw new Error(`southwood webhook ingest failed: ${ingest.reason ?? "no tx"}`);
  }
  if (ingest.verificationIssues?.length) {
    console.log(`[${VENDOR_TENANT}] ⚠ verification: ${ingest.verificationIssues.join("; ")}`);
  }

  writeWitnessPool(VENDOR_TENANT, hubAKey, hubBKey);
  const witnessReceived = await registerWitnessAttestationFanOut({
    envelope: malEnvelope as Parameters<typeof registerWitnessAttestationFanOut>[0]["envelope"],
    side: "received",
  });
  if (witnessReceived) {
    console.log(
      `[${VENDOR_TENANT}] witness received: ${witnessReceived.succeeded.length}/${witnessReceived.succeeded.length + witnessReceived.failed.length} hubs · quorum ${witnessReceived.quorum.satisfied ? "ok" : "pending"}`
    );
  }

  const company = loadCompany();
  const ackNotice = proposeInterOrgAck({
    peerId: "PEER-002",
    proposedBy: "秘書オペレータ",
    correlationEventId: sharedEventId,
    contractId: "CTR-012",
    message: "契約範囲内の運用を確認",
  });

  const { transmission: ackTx } = approveInterOrgNotice({
    noticeId: ackNotice.notice_id,
    approverId: company.representative?.replace(/\s/g, "") ?? "南木健一",
  });

  writeOutboxCopy("03-vendor-obligation-ack.json", ackTx.envelope);

  const v = validateProtocolState();
  if (!v.ok) {
    throw new Error(`${VENDOR_TENANT} protocol validate failed: ${v.issues.map((i) => i.message).join("; ")}`);
  }

  console.log(
    `[${VENDOR_TENANT}] ✓ inbound ${ingest.transactionId} · ack ${ackNotice.notice_id} → ${ackTx.transaction.transaction_id}`
  );
}

async function main(): Promise<void> {
  console.log(`Inter-org demo — operator approval + witness pool (${MAL_TENANT} ↔ ${VENDOR_TENANT})\n`);

  if (!existsSync(join(ROOT_DIR, "tenants", VENDOR_TENANT, "tenant.yaml"))) {
    console.error(`Tenant ${VENDOR_TENANT} not found`);
    process.exit(1);
  }

  const hubs = await startDemoWitnessHubs();
  try {
    ensureCtr012Executed();
    const mal = await seedMalSide(DEMO_EVENT_ID, hubs.hubAKey, hubs.hubBKey);
    await seedVendorSide(DEMO_EVENT_ID, mal.path, hubs.hubAKey, hubs.hubBKey, mal.envelope);

    // v2: simulate HUB-B partition — wipe local SoT, backfill via gossip from HUB-A
    configureHubRuntime({ hubId: "HUB-B", dataDir: HUB_B_DIR });
    for (const file of ["witness-attestations.jsonl", "witness-receipts.jsonl"]) {
      const p = join(HUB_B_DIR, file);
      if (existsSync(p)) rmSync(p);
    }
    const cursorDir = join(HUB_B_DIR, "gossip-cursor");
    if (existsSync(cursorDir)) rmSync(cursorDir, { recursive: true, force: true });

    const gossipResult = await syncFromPeer("HUB-A");
    const receiptB = findHubReceiptByEventId(DEMO_EVENT_ID);
    const attCount = loadHubAttestations().length;
    console.log(
      `\n[v2 gossip] HUB-B partition recovery: imported=${gossipResult.imported} skipped=${gossipResult.skipped} attestations=${attCount} · receipt=${receiptB?.status ?? "none"} hub_id=${receiptB?.hub_id ?? "—"}`
    );
    if (attCount < 2 || receiptB?.hub_id !== "HUB-B" || receiptB?.status !== "mutually_confirmed") {
      throw new Error(
        `gossip backfill failed: attestations=${attCount} imported=${gossipResult.imported} hub_id=${receiptB?.hub_id} status=${receiptB?.status} issues=${gossipResult.issues.join("; ")}`
      );
    }

    console.log("\n--- Summary ---");
    console.log("Flow: operator propose → CEO approve → webhook ingest → ack · witness fan-out · gossip sync");
    console.log(`Shared event_id: ${DEMO_EVENT_ID}`);
    console.log("\nTry:");
    console.log("  npm run steward -- --tenant mal protocol witness verify --event-id", DEMO_EVENT_ID);
    console.log("  npm run steward -- --tenant mal protocol witness pool status");
    console.log("  docs/org-os/witness-hub-requirements.md");
  } finally {
    hubs.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
