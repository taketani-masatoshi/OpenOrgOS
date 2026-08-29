import { startHubServer } from "../lib/hub-server.js";
import { configureHubRuntime } from "../lib/hub/runtime.js";
import { findHubReceiptByEventId, verifyHubReceipt } from "../lib/hub/receipt.js";
import { getAttestationStatus } from "../lib/hub/registry.js";
import { exportHubPublicKeyBase64 } from "../lib/hub/signing.js";
import {
  ensureSignedMerkleAnchor,
  computeMerkleAnchorForDate,
  saveSignedMerkleAnchor,
  signMerkleAnchor,
  verifySignedMerkleAnchor,
  type SignedMerkleAnchor,
} from "../lib/hub/merkle-anchor.js";
import { exportGossipSnapshot } from "../lib/hub/gossip.js";
import { exportAttestationGossip } from "../lib/hub/gossip-attestation.js";
import { syncFromPeer, syncAllPeers } from "../lib/hub/gossip-sync.js";
import {
  loadHubFederation,
  addFederationPeer,
} from "../lib/hub/federation.js";
import { fetchReceiptFromHub } from "../lib/protocol/witness-attestation-build.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { WitnessHubEntry } from "../../schemas/protocol/witness-pool.js";
import { ensureDevServerTls } from "../lib/protocol/dev-server-tls.js";
import { getDeployDir } from "../lib/orgos-paths.js";
import { buildWitnessHubGaReport } from "../lib/hub/ga-check.js";
import { assertHubPublicBindAllowed } from "../lib/hub/public-bind.js";

export interface HubServeOptions {
  hubId: string;
  dataDir: string;
  host?: string;
  port?: number;
  gossipIntervalSec?: number;
  tlsCert?: string;
  tlsKey?: string;
  tlsCa?: string;
  mtlsRequired?: boolean;
}

export async function runHubServe(opts: HubServeOptions): Promise<void> {
  assertHubPublicBindAllowed({
    host: opts.host,
    tlsCert: opts.tlsCert,
    tlsKey: opts.tlsKey,
  });
  mkdirSync(opts.dataDir, { recursive: true });
  await startHubServer({
    hubId: opts.hubId,
    dataDir: opts.dataDir,
    host: opts.host,
    port: opts.port,
    gossipIntervalSec: opts.gossipIntervalSec,
    tls:
      opts.tlsCert && opts.tlsKey
        ? {
            certPath: opts.tlsCert,
            keyPath: opts.tlsKey,
            caPath: opts.tlsCa,
            mtlsRequired: opts.mtlsRequired,
          }
        : undefined,
  });
}

export interface HubExportPublicKeyOptions {
  hubId: string;
  dataDir: string;
  json?: boolean;
}

export function runHubExportPublicKey(opts: HubExportPublicKeyOptions): void {
  configureHubRuntime({ hubId: opts.hubId, dataDir: opts.dataDir });
  mkdirSync(opts.dataDir, { recursive: true });
  const publicKey = exportHubPublicKeyBase64();
  if (opts.json) {
    console.log(JSON.stringify({ hub_id: opts.hubId, public_key: publicKey }, null, 2));
    return;
  }
  console.log(`hub_id: ${opts.hubId}`);
  console.log(`public_key: ${publicKey}`);
}

export interface HubVerifyOptions {
  hubId: string;
  dataDir?: string;
  eventId: string;
  hubUrl?: string;
  hubPublicKey?: string;
  json?: boolean;
}

export async function runHubVerify(opts: HubVerifyOptions): Promise<void> {
  let receipt = undefined as ReturnType<typeof findHubReceiptByEventId>;
  let status: ReturnType<typeof getAttestationStatus> | undefined;
  let pubKey = opts.hubPublicKey;

  if (opts.hubUrl) {
    receipt = await fetchReceiptFromHub(opts.hubUrl, opts.eventId);
    if (!receipt) {
      console.error(`No receipt for event ${opts.eventId} at ${opts.hubUrl}`);
      process.exit(1);
    }
    if (!pubKey) {
      const base = opts.hubUrl.replace(/\/$/, "");
      const res = await fetch(`${base}/hub/v1/public-key`);
      if (res.ok) {
        const body = (await res.json()) as { public_key?: string };
        pubKey = body.public_key;
      }
    }
  } else {
    if (!opts.dataDir) {
      console.error("Either --hub-url or --data-dir is required");
      process.exit(1);
    }
    configureHubRuntime({ hubId: opts.hubId, dataDir: opts.dataDir });
    receipt = findHubReceiptByEventId(opts.eventId);
    status = getAttestationStatus(opts.eventId);
    pubKey = pubKey ?? exportHubPublicKeyBase64();
  }

  if (!receipt) {
    console.error(`No receipt for event ${opts.eventId}`);
    process.exit(1);
  }
  if (!pubKey) {
    console.error("hub public key required for verification");
    process.exit(1);
  }

  const sigOk = verifyHubReceipt(receipt, pubKey);
  const out = { receipt, status, signature_ok: sigOk, source: opts.hubUrl ? "remote" : "local" };
  if (opts.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log(`receipt: ${receipt.receipt_id} · status: ${receipt.status} · source: ${out.source}`);
  console.log(`signature: ${sigOk ? "ok" : "INVALID"}`);
  if (!sigOk) process.exit(1);
}

export interface HubAnchorExportOptions {
  hubId: string;
  dataDir: string;
  date?: string;
  json?: boolean;
}

export function runHubAnchorExport(opts: HubAnchorExportOptions): void {
  configureHubRuntime({ hubId: opts.hubId, dataDir: opts.dataDir });
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const record = computeMerkleAnchorForDate(date);
  const signed = signMerkleAnchor(record);
  const path = saveSignedMerkleAnchor(signed);
  if (opts.json) {
    console.log(JSON.stringify({ ...signed, path }, null, 2));
    return;
  }
  console.log(`✓ signed merkle anchor ${date}: ${signed.merkle_root.slice(0, 16)}… (${signed.receipt_count} receipts)`);
  console.log(`  saved: ${path}`);
}

export interface HubAnchorVerifyOptions {
  hubId: string;
  dataDir?: string;
  hubUrl?: string;
  date?: string;
  hubPublicKey?: string;
  json?: boolean;
}

export async function runHubAnchorVerify(opts: HubAnchorVerifyOptions): Promise<void> {
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  let anchor: SignedMerkleAnchor | undefined;
  let pubKey = opts.hubPublicKey;

  if (opts.hubUrl) {
    const base = opts.hubUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/hub/v1/anchor?date=${date}`);
    if (!res.ok) {
      console.error(`Anchor fetch failed: HTTP ${res.status}`);
      process.exit(1);
    }
    const body = (await res.json()) as { anchor?: SignedMerkleAnchor };
    anchor = body.anchor;
    if (!pubKey) {
      const pkRes = await fetch(`${base}/hub/v1/public-key`);
      if (pkRes.ok) {
        const pkBody = (await pkRes.json()) as { public_key?: string };
        pubKey = pkBody.public_key;
      }
    }
  } else {
    if (!opts.dataDir) {
      console.error("Either --hub-url or --data-dir is required");
      process.exit(1);
    }
    configureHubRuntime({ hubId: opts.hubId, dataDir: opts.dataDir });
    anchor = ensureSignedMerkleAnchor(date);
    pubKey = pubKey ?? exportHubPublicKeyBase64();
  }

  if (!anchor?.hub_signature) {
    console.error("No signed anchor found");
    process.exit(1);
  }
  if (!pubKey) {
    console.error("hub public key required");
    process.exit(1);
  }

  const ok = verifySignedMerkleAnchor(anchor, pubKey);
  if (opts.json) {
    console.log(JSON.stringify({ anchor, signature_ok: ok }, null, 2));
    return;
  }
  console.log(`anchor ${anchor.date}: merkle_root=${anchor.merkle_root.slice(0, 16)}…`);
  console.log(`signature: ${ok ? "ok" : "INVALID"}`);
  if (!ok) process.exit(1);
}

export interface HubGossipExportOptions {
  hubId: string;
  dataDir: string;
  since?: string;
  json?: boolean;
}

export function runHubGossipExport(opts: HubGossipExportOptions): void {
  configureHubRuntime({ hubId: opts.hubId, dataDir: opts.dataDir });
  const snapshot = exportGossipSnapshot(opts.since);
  if (opts.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log(`✓ gossip snapshot: ${snapshot.receipt_count} receipt(s) (audit read-only)`);
}

export interface HubGossipAttestationExportOptions {
  hubId: string;
  dataDir: string;
  since?: string;
  json?: boolean;
}

export function runHubGossipAttestationExport(opts: HubGossipAttestationExportOptions): void {
  configureHubRuntime({ hubId: opts.hubId, dataDir: opts.dataDir });
  const snapshot = exportAttestationGossip({ since: opts.since });
  if (opts.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log(`✓ attestation gossip export: ${snapshot.attestation_count}`);
}

export interface HubAnchorShowOptions {
  hubId: string;
  dataDir: string;
  date?: string;
  json?: boolean;
}

export function runHubAnchorShow(opts: HubAnchorShowOptions): void {
  configureHubRuntime({ hubId: opts.hubId, dataDir: opts.dataDir });
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const anchor = ensureSignedMerkleAnchor(date);
  if (opts.json) {
    console.log(JSON.stringify(anchor, null, 2));
    return;
  }
  console.log(`date: ${anchor.date} · receipts: ${anchor.receipt_count}`);
  console.log(`merkle_root: ${anchor.merkle_root}`);
  console.log(`signed: ${anchor.hub_signature ? "yes" : "no"}`);
}

export interface HubFederationShowOptions {
  hubId: string;
  dataDir: string;
  json?: boolean;
}

export function runHubFederationShow(opts: HubFederationShowOptions): void {
  configureHubRuntime({ hubId: opts.hubId, dataDir: opts.dataDir });
  const federation = loadHubFederation();
  if (opts.json) {
    console.log(JSON.stringify(federation, null, 2));
    return;
  }
  console.log(`federation ${federation.hub_id}: ${federation.hub_peers.length} peer(s) · gossip=${federation.gossip.enabled}`);
  for (const p of federation.hub_peers) {
    console.log(`  · ${p.hub_id}: ${p.hub_url}`);
  }
}

export interface HubFederationAddPeerOptions {
  hubId: string;
  dataDir: string;
  peerId: string;
  peerUrl: string;
  publicKey?: string;
  priority?: number;
  json?: boolean;
}

export async function runHubFederationAddPeer(opts: HubFederationAddPeerOptions): Promise<void> {
  configureHubRuntime({ hubId: opts.hubId, dataDir: opts.dataDir });
  let hubPublicKey = opts.publicKey;
  if (!hubPublicKey) {
    const base = opts.peerUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/hub/v1/public-key`);
    if (!res.ok) {
      console.error(`Failed to fetch public key from ${opts.peerUrl}`);
      process.exit(1);
    }
    const body = (await res.json()) as { public_key?: string };
    hubPublicKey = body.public_key;
  }
  if (!hubPublicKey) {
    console.error("public key required");
    process.exit(1);
  }
  const peer: WitnessHubEntry = {
    hub_id: opts.peerId,
    hub_url: opts.peerUrl,
    hub_public_key: hubPublicKey,
    priority: opts.priority ?? 1,
  };
  const federation = addFederationPeer(peer);
  if (opts.json) {
    console.log(JSON.stringify(federation, null, 2));
    return;
  }
  console.log(`✓ added peer ${opts.peerId} to hub-federation.yaml`);
}

export interface HubGossipSyncOptions {
  hubId: string;
  dataDir: string;
  peer?: string;
  json?: boolean;
}

export async function runHubGossipSync(opts: HubGossipSyncOptions): Promise<void> {
  configureHubRuntime({ hubId: opts.hubId, dataDir: opts.dataDir });
  const results = opts.peer ? [await syncFromPeer(opts.peer)] : await syncAllPeers();
  if (opts.json) {
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }
  for (const r of results) {
    console.log(`✓ sync ${r.peer_id}: imported=${r.imported} skipped=${r.skipped} receipts=${r.receipts_rebuilt}`);
    for (const issue of r.issues) console.log(`  ! ${issue}`);
  }
}

export interface HubTlsInitOptions {
  outputDir?: string;
  force?: boolean;
  json?: boolean;
}

export function runHubTlsInit(opts: HubTlsInitOptions = {}): void {
  const tlsDir = opts.outputDir ?? join(getDeployDir(), "witness-hub", "tls");
  const pki = ensureDevServerTls({
    outputDir: tlsDir,
    commonName: "witness-hub.local",
    dnsNames: ["localhost", "127.0.0.1", "witness-hub.local"],
    force: opts.force,
  });
  const summary = {
    tls_dir: pki.dir,
    ca_cert: pki.caCertPath,
    server_cert: pki.serverCertPath,
    server_key: pki.serverKeyPath,
    compose: "docker compose -f docker-compose.yaml -f docker-compose.tls.yaml up",
    serve_example: `orgos hub serve --tls-cert ${pki.serverCertPath} --tls-key ${pki.serverKeyPath}`,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`✓ Witness Hub dev TLS · ${pki.dir}`);
  console.log(`  Next: cd deploy/witness-hub && ${summary.compose}`);
}

export function runHubGaCheck(opts: { json?: boolean } = {}): void {
  const report = buildWitnessHubGaReport();
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  for (const check of report.checks) {
    console.log(`${check.pass ? "✓" : "✗"} ${check.id} — ${check.detail}`);
  }
  console.log(
    report.ready_for_public_relay
      ? "✓ Public relay GA: TLS material present"
      : report.ok
        ? "△ File gates pass — generate TLS (`orgos hub tls-init`) before public bind"
        : "✗ Public relay GA incomplete",
  );
  if (!report.ok) process.exitCode = 1;
}
