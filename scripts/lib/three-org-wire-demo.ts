#!/usr/bin/env node
/**
 * 3-org Wire E2E — mal ↔ southwood (inter-org) + mal → southwood relay → aiac (mesh)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTenantId, getTenantDir, ROOT_DIR } from "../../src/lib/tenant.js";
import { registerPeer } from "../../src/lib/protocol/peers.js";
import {
  ensureProtocolSigningKey,
  exportProtocolPublicKeyBase64,
} from "../../src/lib/protocol/signing.js";
import { deliverEnvelopeViaMesh } from "../../src/lib/protocol/peer-mesh.js";
import { getMeshRoutesYamlPath, getProtocolInboxDir } from "../../src/lib/protocol/paths.js";
import { recordProtocolTransaction } from "../../src/lib/protocol/record-transaction.js";
import { validateProtocolState } from "../../src/lib/protocol/validate.js";
import { ingestWebhook } from "../../src/lib/webhook.js";
import {
  DEMO_EVENT_ID,
  MAL_TENANT,
  runInterOrgDemo,
  VENDOR_TENANT,
} from "../seed-inter-org-demo.js";

export const AIAC_TENANT = "aiac";
export const PEER_AIAC = "PEER-003";
export const PEER_RELAY = "PEER-004";

const RELAY_PORT = Number(process.env.DEMO_MESH_RELAY_PORT ?? 0);
const AIAC_WEBHOOK_PORT = Number(process.env.DEMO_AIAC_WEBHOOK_PORT ?? 0);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const AIAC_DEMO_RUNTIME_FILES = [
  "audit-chain.jsonl",
  "witness-pending.yaml",
  "wire-pending.yaml",
  "signing-key.pem",
  "transactions-registry.yaml",
  "witness-pool.yaml",
  "peers.yaml",
] as const;

const AIAC_DEMO_RUNTIME_DIRS = ["witness-receipts", "relay-store"] as const;

function resetAiacProtocolScratch(): void {
  const base = join(getTenantDir(AIAC_TENANT), "data", "protocol");
  const docsProtocol = join(getTenantDir(AIAC_TENANT), "docs", "protocol");
  for (const sub of ["outbox", "inbox"]) {
    const p = join(docsProtocol, sub);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  if (!existsSync(base)) return;
  for (const name of AIAC_DEMO_RUNTIME_FILES) {
    const p = join(base, name);
    if (existsSync(p)) rmSync(p, { force: true });
  }
  for (const name of AIAC_DEMO_RUNTIME_DIRS) {
    const p = join(base, name);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function seedAiacPeerRegistry(malPublicKey: string): void {
  setTenantId(AIAC_TENANT);
  resetAiacProtocolScratch();
  ensureProtocolSigningKey();
  registerPeer({
    peer_id: "PEER-001",
    display_name: "株式会社MAL",
    jurisdiction: "JP",
    org_uri: `steward://tenant/${MAL_TENANT}`,
    protocol_public_key: malPublicKey,
  });
}

async function startRelayHopServer(
  postOrder: string[]
): Promise<{ close: () => void; port: number }> {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      json(res, 404, { ok: false });
      return;
    }
    await readBody(req);
    postOrder.push(PEER_RELAY);
    json(res, 202, { ok: true, hop: PEER_RELAY });
  });
  await new Promise<void>((r) => server.listen(RELAY_PORT, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  return { close: () => server.close(), port };
}

async function startAiacWebhookServer(postOrder: string[]): Promise<{
  close: () => void;
  url: string;
  port: number;
}> {
  const path = "/webhook";
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== path) {
      json(res, 404, { ok: false });
      return;
    }
    try {
      const rawText = await readBody(req);
      const raw = JSON.parse(rawText);
      setTenantId(AIAC_TENANT);
      const result = ingestWebhook({ raw });
      if (!result.ok && !result.idempotent) {
        json(res, 422, result);
        return;
      }
      postOrder.push(PEER_AIAC);
      json(res, 202, { ok: true, ...result });
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
  await new Promise<void>((r) => server.listen(AIAC_WEBHOOK_PORT, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${port}${path}`;
  return { close: () => server.close(), url, port };
}

export interface ThreeOrgWireDemoResult {
  interOrgEventId: string;
  meshEventId: string;
  meshInboxPath: string;
  postOrder: string[];
}

export async function runMeshToAiac(
  postOrder: string[],
  relayPort: number,
  aiacWebhookUrl: string
): Promise<{
  meshEventId: string;
  inboxPath: string;
}> {
  setTenantId(MAL_TENANT);
  ensureProtocolSigningKey();

  setTenantId(MAL_TENANT);
  const malPublicKey = exportProtocolPublicKeyBase64();
  if (!malPublicKey) {
    throw new Error("mal protocol public key missing");
  }
  seedAiacPeerRegistry(malPublicKey);

  setTenantId(MAL_TENANT);
  registerPeer({
    peer_id: PEER_RELAY,
    display_name: "Southwood mesh relay",
    jurisdiction: "JP",
    org_uri: `steward://tenant/${VENDOR_TENANT}`,
    inbound_endpoints: [{ url: `http://127.0.0.1:${relayPort}/relay`, priority: 1, mode: "relay" }],
  });
  registerPeer({
    peer_id: PEER_AIAC,
    display_name: "AIAC株式会社",
    jurisdiction: "JP",
    org_uri: `steward://tenant/${AIAC_TENANT}`,
    inbound_endpoints: [
      {
        url: aiacWebhookUrl,
        priority: 1,
        mode: "push",
      },
    ],
  });

  mkdirSync(join(getTenantDir(MAL_TENANT), "data", "protocol"), { recursive: true });
  writeFileSync(
    getMeshRoutesYamlPath(),
    `routes:
  - destination_peer_id: ${PEER_AIAC}
    via:
      - ${PEER_RELAY}
      - ${PEER_AIAC}
    notes: 3-org demo mal → southwood relay → aiac
`,
    "utf-8"
  );

  const meshEventId = randomUUID();
  const { envelope } = recordProtocolTransaction({
    transactionType: "contract.execution.notice",
    peerId: PEER_AIAC,
    direction: "outbound",
    contractId: "CTR-012",
    notes: "3-org wire demo — mesh leg to AIAC",
    eventId: meshEventId,
    correlationId: DEMO_EVENT_ID,
    operatorAttestation: {
      operator_id: "秘書オペレータ",
      approver_id: "段燕燕",
      approved_at: new Date().toISOString(),
      basis: "existing_contract",
      basis_ref: "CTR-012",
      approval_id: "DEMO-THREE-ORG-MESH",
    },
  });

  const result = await deliverEnvelopeViaMesh(envelope, PEER_AIAC);
  if (!result.delivered || result.queued) {
    throw new Error(`mesh deliver to AIAC failed: ${result.reason}`);
  }

  setTenantId(AIAC_TENANT);
  const inboxPath = join(getProtocolInboxDir(), `${meshEventId}.json`);
  if (!existsSync(inboxPath)) {
    throw new Error(`AIAC inbox missing: ${inboxPath}`);
  }

  const aiacValidate = validateProtocolState();
  if (!aiacValidate.ok) {
    throw new Error(
      `aiac protocol validate failed: ${aiacValidate.issues.map((i) => i.message).join("; ")}`
    );
  }

  return { meshEventId, inboxPath };
}

export async function runThreeOrgWireDemo(): Promise<ThreeOrgWireDemoResult> {
  for (const id of [MAL_TENANT, VENDOR_TENANT, AIAC_TENANT]) {
    if (!existsSync(join(ROOT_DIR, "tenants", id, "tenant.yaml"))) {
      throw new Error(`Tenant ${id} not found`);
    }
  }

  console.log("=== Phase 1: mal ↔ southwood (inter-org) ===\n");
  await runInterOrgDemo();

  console.log("\n=== Phase 2: mal → southwood relay → aiac (mesh) ===\n");
  const postOrder: string[] = [];
  const relay = await startRelayHopServer(postOrder);
  const aiacWebhook = await startAiacWebhookServer(postOrder);

  try {
    const mesh = await runMeshToAiac(postOrder, relay.port, aiacWebhook.url);

    setTenantId(MAL_TENANT);
    const malValidate = validateProtocolState();
    if (!malValidate.ok) {
      throw new Error(`mal protocol validate failed after mesh`);
    }
    setTenantId(VENDOR_TENANT);
    const southwoodValidate = validateProtocolState();
    if (!southwoodValidate.ok) {
      throw new Error(`southwood protocol validate failed after mesh`);
    }

    console.log(`[mesh] ✓ hops: ${PEER_RELAY} → ${PEER_AIAC}`);
    console.log(`  POST order: ${postOrder.join(" → ")}`);
    console.log(`  mesh event_id: ${mesh.meshEventId}`);
    console.log(`  aiac inbox: ${mesh.inboxPath}`);

    console.log("\n--- 3-org Summary ---");
    console.log(`Orgs: ${MAL_TENANT} · ${VENDOR_TENANT} · ${AIAC_TENANT}`);
    console.log(`Inter-org event_id: ${DEMO_EVENT_ID}`);
    console.log(`Mesh event_id: ${mesh.meshEventId}`);
    console.log("\nVerify:");
    console.log("  npm run orgos -- --tenant mal protocol transaction list");
    console.log("  npm run orgos -- --tenant southwood protocol transaction list");
    console.log("  npm run orgos -- --tenant aiac protocol transaction list");
    console.log("  npm run orgos -- --tenant aiac protocol audit verify");

    return {
      interOrgEventId: DEMO_EVENT_ID,
      meshEventId: mesh.meshEventId,
      meshInboxPath: mesh.inboxPath,
      postOrder,
    };
  } finally {
    relay.close();
    aiacWebhook.close();
  }
}
