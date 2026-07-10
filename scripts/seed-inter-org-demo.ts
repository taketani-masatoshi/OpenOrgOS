#!/usr/bin/env node
/**
 * Inter-org protocol デモ — operator propose → approver approve → peer inbound ack · witness pool
 */

import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTenantId, ROOT_DIR, getTenantDir } from "../src/lib/tenant.js";
import { currentDate, readYamlFile, writeYamlFile } from "../src/lib/utils.js";
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
import { verifyProtocolAuditChain, loadProtocolAuditChain } from "../src/lib/protocol/audit-chain.js";
import { loadEnvelopesFromDirectories } from "../src/lib/protocol/external-verify.js";
import { serializeEventEnvelope } from "../src/lib/protocol/envelope.js";
import { getProtocolOutboxDir } from "../src/lib/protocol/paths.js";
import { writeOutboxEnvelope } from "../src/lib/protocol/audit-chain.js";
import { runWithProtocolWriteGuard } from "../src/lib/protocol/protocol-write-guard.js";
import { writeOutboxProvenance } from "../src/lib/protocol/outbox-provenance.js";
import type { EventEnvelope } from "../schemas/protocol/org-event.js";
import { loadCompany } from "../src/lib/data.js";
import { orgApprovalRegistrySchema } from "../schemas/org/approval.js";
import { getPendingApprovalsPath } from "../src/lib/org/paths.js";
import { enqueueWitnessPending } from "../src/lib/protocol/witness-queue.js";
import { envelopeDigest } from "../src/lib/protocol/canonical.js";
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
import {
  deliverProtocolEnvelopeWithRelay,
  flushWireRelayInbox,
} from "../src/lib/protocol/transport.js";
import {
  configurePartyForProposal3,
  patchContractForProposal3,
  startOrgCInfrastructure,
} from "./lib/proposal3-org-c.js";

const HUB_A_DIR = join(ROOT_DIR, "data", "hub-a");
const HUB_B_DIR = join(ROOT_DIR, "data", "hub-b");
/** Default 0 = OS-assigned (avoids EADDRINUSE in parallel tests). Override via DEMO_HUB_*_PORT. */
const HUB_A_PORT = Number(process.env.DEMO_HUB_A_PORT ?? 0);
const HUB_B_PORT = Number(process.env.DEMO_HUB_B_PORT ?? 0);

export const DEMO_EVENT_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
export const MAL_TENANT = "mal";
export const VENDOR_TENANT = "southwood";
const VENDOR_LEGAL_NAME = "株式会社サウスウッド";

function protocolDir(tenantId: string): string {
  return join(getTenantDir(tenantId), "data", "protocol");
}

/** Runtime scratch only — preserve committed wire/gov gateway config. */
const PROTOCOL_DEMO_RUNTIME_FILES = [
  "audit-chain.jsonl",
  "witness-pending.yaml",
  "wire-pending.yaml",
  "wire-gateway-audit.jsonl",
  "mesh-routes.yaml",
  "signing-key-meta.yaml",
  "signing-key.pem",
  "transactions-registry.yaml",
  "witness-pool.yaml",
  "peers.yaml",
] as const;

const PROTOCOL_DEMO_RUNTIME_DIRS = ["witness-receipts", "relay-store"] as const;

function resetProtocolState(tenantId: string): void {
  const base = protocolDir(tenantId);
  const docsProtocol = join(getTenantDir(tenantId), "docs", "protocol");
  for (const sub of ["outbox", "inbox"]) {
    const p = join(docsProtocol, sub);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  if (!existsSync(base)) return;
  for (const name of PROTOCOL_DEMO_RUNTIME_FILES) {
    const p = join(base, name);
    if (existsSync(p)) rmSync(p, { force: true });
  }
  for (const name of PROTOCOL_DEMO_RUNTIME_DIRS) {
    const p = join(base, name);
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
  return runWithProtocolWriteGuard("seed-inter-org", () => {
    const dir = getProtocolOutboxDir();
    mkdirSync(dir, { recursive: true });
    const path = join(dir, filename);
    const parsed = envelope as EventEnvelope;
    writeFileSync(path, serializeEventEnvelope(parsed), "utf-8");
    writeOutboxProvenance(dir, parsed, "seed-inter-org");
    return path;
  });
}

function writeWitnessPool(
  tenantId: string,
  hubAKey: string,
  hubBKey: string,
  hubAPort: number,
  hubBPort: number
): void {
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
          hub_url: `http://127.0.0.1:${hubAPort}`,
          hub_public_key: hubAKey,
          priority: 1,
        },
        {
          hub_id: "HUB-B",
          hub_url: `http://127.0.0.1:${hubBPort}`,
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
  hubAPort: number;
  hubBPort: number;
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
  const hubA = await startHubServer({ hubId: "HUB-A", dataDir: HUB_A_DIR, port: HUB_A_PORT });
  const hubB = await startHubServer({ hubId: "HUB-B", dataDir: HUB_B_DIR, port: HUB_B_PORT });
  writeHubFederation(HUB_A_DIR, "HUB-A", [
    { hub_id: "HUB-B", hub_url: hubB.url, hub_public_key: hubBKey },
  ]);
  writeHubFederation(HUB_B_DIR, "HUB-B", [
    { hub_id: "HUB-A", hub_url: hubA.url, hub_public_key: hubAKey },
  ]);
  return {
    hubAKey,
    hubBKey,
    hubAPort: hubA.port,
    hubBPort: hubB.port,
    close: () => {
      hubA.close();
      hubB.close();
    },
  };
}

export const AIAC_TENANT = "aiac";

async function seedMalSendOnly(
  sharedEventId: string,
  orgC: { relayEnqueueUrl: string; bundleUrl: string; pki: import("../src/lib/protocol/tls-pki.js").Proposal3PkiMaterial }
): Promise<{ path: string; envelope: EventEnvelope }> {
  setTenantId(MAL_TENANT);
  resetProtocolState(MAL_TENANT);
  ensureProtocolSigningKey();

  patchContractForProposal3(MAL_TENANT, "CTR-012", orgC.bundleUrl, AIAC_TENANT);
  await configurePartyForProposal3({
    tenantId: MAL_TENANT,
    peerId: "PEER-001",
    peerDisplayName: VENDOR_LEGAL_NAME,
    peerOrgUri: `steward://tenant/${VENDOR_TENANT}`,
    relayEnqueueUrl: orgC.relayEnqueueUrl,
    bundleUrl: orgC.bundleUrl,
    orgCTenantId: AIAC_TENANT,
    pki: orgC.pki,
  });

  const company = loadCompany();
  const notice = proposeInterOrgNotice({
    peerId: "PEER-001",
    contractId: "CTR-012",
    proposedBy: "秘書オペレータ",
    message: "オフィス賃貸借に基づき、契約通りの運用・請求サイクルを開始します。",
  });

  const { transmission } = approveInterOrgNotice({
    noticeId: notice.notice_id,
    approverId: company.representative?.split("、")[0] ?? "段燕燕",
    eventId: sharedEventId,
  });

  writeOutboxCopy(`${sharedEventId}.json`, transmission.envelope);

  const delivery = await deliverProtocolEnvelopeWithRelay(transmission.envelope, "PEER-001");
  if (!delivery.delivered) {
    throw new Error(`mal relay deliver failed: ${delivery.reason}`);
  }

  const v = validateProtocolState();
  if (!v.ok) {
    throw new Error(`mal protocol validate failed: ${v.issues.map((i) => i.message).join("; ")}`);
  }

  console.log(
    `[mal] ✓ 送信 1通 · ${transmission.transaction.transaction_id} · Org C relay · event ${sharedEventId.slice(0, 8)}…`
  );
  return {
    path: join(getProtocolOutboxDir(), `${sharedEventId}.json`),
    envelope: transmission.envelope,
  };
}

async function seedMalSide(
  sharedEventId: string,
  hubAKey: string,
  hubBKey: string,
  hubAPort: number,
  hubBPort: number
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
    message: "オフィス賃貸借に基づき、契約通りの運用・請求サイクルを開始します。",
  });

  const { transmission } = approveInterOrgNotice({
    noticeId: notice.notice_id,
    approverId: company.representative?.split("、")[0] ?? "段燕燕",
    eventId: sharedEventId,
  });

  writeOutboxCopy("03-mal-execution-notice.json", transmission.envelope);

  writeWitnessPool(MAL_TENANT, hubAKey, hubBKey, hubAPort, hubBPort);
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
  hubAPort: number,
  hubBPort: number,
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

  writeWitnessPool(VENDOR_TENANT, hubAKey, hubBKey, hubAPort, hubBPort);
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

async function seedVendorReceiveOnly(
  orgC: { bundleUrl: string; apiUrl: string; pki: import("../src/lib/protocol/tls-pki.js").Proposal3PkiMaterial }
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

  patchContractForProposal3(VENDOR_TENANT, "CTR-012", orgC.bundleUrl, AIAC_TENANT);
  await configurePartyForProposal3({
    tenantId: VENDOR_TENANT,
    peerId: "PEER-002",
    peerDisplayName: "株式会社MAL",
    peerOrgUri: `steward://tenant/${MAL_TENANT}`,
    relayEnqueueUrl: `${orgC.apiUrl}/protocol/v1/relay/enqueue`,
    bundleUrl: orgC.bundleUrl,
    orgCTenantId: AIAC_TENANT,
    pki: orgC.pki,
    protocolPublicKey: malPublicKey,
  });

  const pulled = await flushWireRelayInbox(orgC.apiUrl);
  if (pulled < 1) {
    throw new Error(`southwood relay pull failed: pulled=${pulled}`);
  }

  const v = validateProtocolState();
  if (!v.ok) {
    throw new Error(`${VENDOR_TENANT} protocol validate failed: ${v.issues.map((i) => i.message).join("; ")}`);
  }

  console.log(`[${VENDOR_TENANT}] ✓ 受信 1通 · Org C relay pull (${pulled})`);
}

function seedAiacWitnessRole(
  eventId: string,
  envelope: EventEnvelope,
  bundleUrl: string
): void {
  setTenantId(AIAC_TENANT);
  for (const p of [
    join(getTenantDir(AIAC_TENANT), "docs", "protocol", "outbox"),
    join(getTenantDir(AIAC_TENANT), "docs", "protocol", "inbox"),
  ]) {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }

  setTenantId(AIAC_TENANT);
  const pendingPath = join(getTenantDir(AIAC_TENANT), "data", "protocol", "witness-pending.yaml");
  if (existsSync(pendingPath)) rmSync(pendingPath);
  enqueueWitnessPending({
    hub_id: "HUB-A",
    event_id: eventId,
    side: "sent",
    envelope_digest: envelopeDigest(envelope),
    last_error: "Proposal 3 — 公証担当（Org C trust bundle 経由）",
  });

  console.log(
    `[${AIAC_TENANT}] ✓ 確認待ち 1件 · trust ${bundleUrl.replace(/^https?:\/\//, "").slice(0, 40)}…`
  );
}

function pruneWireApprovalsForDemo(tenantId: string, eventId: string): void {
  setTenantId(tenantId);
  const path = getPendingApprovalsPath();
  if (!existsSync(path)) return;
  const registry = readYamlFile(path, orgApprovalRegistrySchema);
  const keepInternal = registry.approvals.filter((a) => a.scope !== "wire");
  const wireForEvent = registry.approvals.filter(
    (a) => a.scope === "wire" && a.wire?.wire_event_id === eventId && a.status === "completed"
  );
  const latestWire = wireForEvent.length ? [wireForEvent[wireForEvent.length - 1]!] : [];
  writeYamlFile(path, {
    ...registry,
    as_of: currentDate(),
    approvals: [...keepInternal, ...latestWire],
  });
}

export async function runWireConsoleThreeRoleDemo(): Promise<void> {
  console.log("Wire Console — Proposal 3 · MAL 送信 · southwood 受信 · AIAC Org C（1通）\n");

  if (!existsSync(join(ROOT_DIR, "tenants", AIAC_TENANT, "tenant.yaml"))) {
    throw new Error(`Tenant ${AIAC_TENANT} not found`);
  }

  const hubs = await startDemoWitnessHubs();
  const orgC = await startOrgCInfrastructure(AIAC_TENANT, {
    hubAKey: hubs.hubAKey,
    hubBKey: hubs.hubBKey,
    hubAPort: hubs.hubAPort,
    hubBPort: hubs.hubBPort,
  });
  try {
    ensureCtr012Executed();
    const mal = await seedMalSendOnly(DEMO_EVENT_ID, orgC);
    await seedVendorReceiveOnly(orgC);
    seedAiacWitnessRole(DEMO_EVENT_ID, mal.envelope, orgC.bundleUrl);
    pruneWireApprovalsForDemo(MAL_TENANT, DEMO_EVENT_ID);
    pruneWireApprovalsForDemo(VENDOR_TENANT, DEMO_EVENT_ID);
    console.log(`\nShared event_id: ${DEMO_EVENT_ID}`);
    console.log(`Org C relay: ${orgC.apiUrl} · bundle: ${orgC.bundleUrl}`);
  } finally {
    orgC.close();
    hubs.close();
  }
}

export async function runInterOrgDemo(): Promise<void> {
  console.log(`Inter-org demo — operator approval + witness pool (${MAL_TENANT} ↔ ${VENDOR_TENANT})\n`);

  if (!existsSync(join(ROOT_DIR, "tenants", VENDOR_TENANT, "tenant.yaml"))) {
    throw new Error(`Tenant ${VENDOR_TENANT} not found`);
  }

  const hubs = await startDemoWitnessHubs();
  try {
    ensureCtr012Executed();
    const mal = await seedMalSide(
      DEMO_EVENT_ID,
      hubs.hubAKey,
      hubs.hubBKey,
      hubs.hubAPort,
      hubs.hubBPort
    );
    await seedVendorSide(
      DEMO_EVENT_ID,
      mal.path,
      hubs.hubAKey,
      hubs.hubBKey,
      hubs.hubAPort,
      hubs.hubBPort,
      mal.envelope
    );

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
    setTenantId(MAL_TENANT);
    const malChain = loadProtocolAuditChain();
    const malOutbox = loadEnvelopesFromDirectories([getProtocolOutboxDir()]);
    const witnessOnChain = malChain.filter((r) => {
      const t = malOutbox.get(r.event_id)?.event.type;
      return t?.startsWith("org.witness.");
    }).length;
    const auditVerify = verifyProtocolAuditChain({
      envelopesByEventId: malOutbox,
    });
    console.log(
      `[mal] audit-chain verify: ${auditVerify.ok ? "ok" : "FAIL"} · records=${auditVerify.checked} · witness envelopes=${witnessOnChain}`
    );
    if (!auditVerify.ok) {
      throw new Error(`inter-org audit verify failed: ${auditVerify.issues.map((i) => i.message).join("; ")}`);
    }
    console.log("\nTry:");
    console.log("  npm run orgos -- --tenant mal protocol witness verify --event-id", DEMO_EVENT_ID);
    console.log("  npm run orgos -- --tenant mal protocol witness pool status");
    console.log("  docs/org-os/witness-hub-requirements.md");
  } finally {
    hubs.close();
  }
}

async function main(): Promise<void> {
  try {
    await runInterOrgDemo();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
