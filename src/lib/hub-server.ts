import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer, type ServerOptions } from "node:https";
import { mkdirSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import { witnessAttestationSchema } from "../../schemas/protocol/witness-attestation.js";
import type { WitnessAttestation } from "../../schemas/protocol/witness-attestation.js";
import { configureHubRuntime, runWithHubRuntimeAsync } from "./hub/runtime.js";
import { ensureHubSigningKey, exportHubPublicKeyBase64 } from "./hub/signing.js";
import { registerHubAttestation, findHubReceiptByEventId } from "./hub/receipt.js";
import { getAttestationStatus } from "./hub/registry.js";
import { ensureSignedMerkleAnchor, listSignedMerkleAnchorsSince } from "./hub/merkle-anchor.js";
import { exportGossipSnapshot } from "./hub/gossip.js";
import { exportAttestationGossip, importAttestationGossip } from "./hub/gossip-attestation.js";
import { syncAllPeers, startGossipSyncInterval } from "./hub/gossip-sync.js";
import { loadHubFederation } from "./hub/federation.js";
import {
  getHubDataDir,
  getHubId,
  getHubAttestationsPath,
  getHubReceiptsPath,
} from "./hub/paths.js";

export interface HubTlsOptions {
  certPath: string;
  keyPath: string;
  caPath?: string;
  mtlsRequired?: boolean;
}

export interface HubServerOptions {
  hubId: string;
  dataDir: string;
  host?: string;
  port?: number;
  gossipIntervalSec?: number;
  federationFile?: string;
  tls?: HubTlsOptions;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function countJsonlRecords(path: string): number {
  if (!existsSync(path)) return 0;
  try {
    const text = readFileSync(path, "utf-8").trim();
    if (!text) return 0;
    return text.split("\n").filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

function countAnchorFiles(): number {
  const dir = join(getHubDataDir(), "merkle-anchors");
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

export interface HubServerHandle {
  close: () => void;
  port: number;
  url: string;
}

export function startHubServer(options: HubServerOptions): Promise<HubServerHandle> {
  const hubConfig = { hubId: options.hubId, dataDir: options.dataDir };
  configureHubRuntime(hubConfig);
  mkdirSync(getHubDataDir(), { recursive: true });
  ensureHubSigningKey();

  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 9474;
  const scheme = options.tls ? "https" : "http";

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (options.tls?.mtlsRequired) {
      const socket = req.socket as TLSSocket;
      if (!socket.authorized) {
        sendJson(res, 401, {
          ok: false,
          error: "mTLS client certificate required",
          reason: socket.authorizationError ?? "unauthorized",
        });
        return;
      }
    }
    try {
      await runWithHubRuntimeAsync(hubConfig, async () => {
        await handleHubRequest(req, res);
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  let server;
  if (options.tls) {
    const httpsOptions: ServerOptions = {
      cert: readFileSync(options.tls.certPath),
      key: readFileSync(options.tls.keyPath),
      ca: options.tls.caPath ? readFileSync(options.tls.caPath) : undefined,
      requestCert: !!options.tls.mtlsRequired,
      rejectUnauthorized: false,
    };
    server = createHttpsServer(httpsOptions, (req, res) => {
      void handler(req, res);
    });
  } else {
    server = createHttpServer((req, res) => {
      void handler(req, res);
    });
  }

  let stopGossip: (() => void) | undefined;
  const federation = loadHubFederation();
  const interval =
    options.gossipIntervalSec ??
    (federation.gossip.enabled ? federation.gossip.interval_sec : undefined);
  if (interval && interval > 0 && federation.hub_peers.length > 0) {
    stopGossip = startGossipSyncInterval(interval);
    console.log(`✓ Gossip sync every ${interval}s (${federation.hub_peers.length} peer(s))`);
  }

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort =
        typeof addr === "object" && addr && "port" in addr ? addr.port : port;
      const url = `${scheme}://${host}:${actualPort}`;
      console.log(`✓ Witness Hub ${options.hubId} ${url}`);
      resolve({
        port: actualPort,
        url,
        close: () => {
          stopGossip?.();
          server.close();
        },
      });
    });
    server.on("error", reject);
  });
}

async function handleHubRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? "";
  const method = req.method ?? "GET";
  const pathname = url.split("?")[0] ?? url;

  if (method === "GET" && pathname === "/hub/v1/health") {
    sendJson(res, 200, { ok: true, hub_id: getHubId() });
    return;
  }

  if (method === "GET" && pathname === "/hub/v1/metrics") {
    const federation = loadHubFederation();
    sendJson(res, 200, {
      ok: true,
      hub_id: getHubId(),
      service: "witness-hub",
      receipts: countJsonlRecords(getHubReceiptsPath()),
      attestations: countJsonlRecords(getHubAttestationsPath()),
      anchors: countAnchorFiles(),
      federation_peers: federation.hub_peers.length,
      gossip_enabled: federation.gossip.enabled,
    });
    return;
  }

  if (method === "GET" && pathname === "/hub/v1/public-key") {
    sendJson(res, 200, {
      hub_id: getHubId(),
      public_key: exportHubPublicKeyBase64(),
    });
    return;
  }

  const receiptMatch = pathname.match(/^\/hub\/v1\/receipts\/([0-9a-f-]{36})$/i);
  if (method === "GET" && receiptMatch) {
    const eventId = receiptMatch[1]!;
    const receipt = findHubReceiptByEventId(eventId);
    if (!receipt) {
      sendJson(res, 404, { ok: false, error: "receipt not found" });
      return;
    }
    sendJson(res, 200, { ok: true, receipt });
    return;
  }

  const attestationMatch = pathname.match(/^\/hub\/v1\/attestations\/([0-9a-f-]{36})$/i);
  if (method === "GET" && attestationMatch) {
    const eventId = attestationMatch[1]!;
    const status = getAttestationStatus(eventId);
    sendJson(res, 200, { ok: true, ...status });
    return;
  }

  if (method === "GET" && pathname.startsWith("/hub/v1/anchor")) {
    const parsed = new URL(url, "http://localhost");
    const date =
      parsed.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const anchor = ensureSignedMerkleAnchor(date);
    sendJson(res, 200, { ok: true, anchor });
    return;
  }

  if (method === "GET" && pathname.startsWith("/hub/v1/gossip/anchors")) {
    const parsed = new URL(url, "http://localhost");
    const since = parsed.searchParams.get("since") ?? undefined;
    const anchors = listSignedMerkleAnchorsSince(since);
    sendJson(res, 200, { ok: true, anchor_count: anchors.length, anchors });
    return;
  }

  if (method === "GET" && pathname.startsWith("/hub/v1/gossip/attestations")) {
    const parsed = new URL(url, "http://localhost");
    const since = parsed.searchParams.get("since") ?? undefined;
    const cursor = parsed.searchParams.get("cursor") ?? undefined;
    const limit = parsed.searchParams.get("limit");
    const snapshot = exportAttestationGossip({
      since,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
    sendJson(res, 200, { ok: true, ...snapshot });
    return;
  }

  if (method === "GET" && pathname.startsWith("/hub/v1/gossip/snapshot")) {
    const parsed = new URL(url, "http://localhost");
    const since = parsed.searchParams.get("since") ?? undefined;
    const snapshot = exportGossipSnapshot(since ?? undefined);
    sendJson(res, 200, { ok: true, ...snapshot, deprecated: true });
    return;
  }

  if (method === "POST" && pathname === "/hub/v1/gossip/attestations/import") {
    const rawText = await readBody(req);
    const body = JSON.parse(rawText) as { attestations?: unknown[] };
    if (!Array.isArray(body.attestations)) {
      sendJson(res, 422, { ok: false, error: "attestations array required" });
      return;
    }
    const result = importAttestationGossip(body.attestations as WitnessAttestation[]);
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (method === "POST" && pathname === "/hub/v1/gossip/import") {
    sendJson(res, 410, {
      ok: false,
      error: "deprecated — use POST /hub/v1/gossip/attestations/import",
    });
    return;
  }

  if (method === "POST" && pathname === "/hub/v1/attestations") {
    const rawText = await readBody(req);
    const parsed = JSON.parse(rawText) as unknown;
    const attestation = witnessAttestationSchema.parse(parsed);
    const result = registerHubAttestation(attestation);
    if (!result.ok) {
      sendJson(res, 422, { ok: false, issues: result.issues });
      return;
    }
    sendJson(res, 201, {
      ok: true,
      attestation_id: result.attestation_id,
      receipt: result.receipt,
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "not found" });
}

export { syncAllPeers };
