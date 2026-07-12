import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer, type ServerOptions } from "node:https";
import { readFileSync } from "node:fs";
import type { TLSSocket } from "node:tls";
import type { WireGatewayConfig } from "../../../schemas/protocol/wire-gateway-config.js";
import type { WireMessage } from "../../../schemas/protocol/wire-message.js";
import { WireInternalClient } from "./internal-client.js";
import { createOutboundPoller } from "./outbound-poller.js";
import { NonceLedger } from "./nonce-ledger.js";
import { RateLimiter } from "./rate-limit.js";
import { appendWireGatewayAudit } from "./audit.js";
import { buildWireNodeWellKnown, validateWireMessage } from "./validate.js";
import {
  checkTimestampSkew,
  findPeerForSender,
  verifyInboundWireMessage,
  wireReceiverIsLocal,
} from "./security.js";
import { envelopeToWireMessage, wireMessageToEnvelope } from "./codec.js";
import {
  exportWireFederationGossipCatalog,
  validateWireFederationGossipPost,
} from "./federation-gossip.js";
import {
  applyIncomingWireFederationGossip,
  listWireFederationCatalogWithGossip,
} from "./federation-gossip-store.js";
import { join } from "node:path";
import { getProtocolDataDir } from "../protocol/paths.js";
import { verifyMtlsClient } from "../protocol/protocol-tls.js";

export interface WireGatewayServerOptions {
  config: WireGatewayConfig;
  publicBaseUrl?: string;
  enableOutbound?: boolean;
  internalClient?: WireInternalClient;
  /** Test/embedded override; production defaults to the tenant protocol data dir. */
  nonceLedgerPath?: string;
}

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

function normalizeIp(ip: string): string {
  const unwrapped = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;
  return unwrapped.startsWith("::ffff:") ? unwrapped.slice(7) : unwrapped;
}

function clientIp(req: IncomingMessage, trustedProxies: string[]): string {
  const remote = normalizeIp(req.socket.remoteAddress ?? "unknown");
  if (!trustedProxies.map(normalizeIp).includes(remote)) return remote;

  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded !== "string") return remote;
  const chain = forwarded
    .split(",")
    .map((ip) => normalizeIp(ip.trim()))
    .filter(Boolean);
  const trusted = new Set(trustedProxies.map(normalizeIp));
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!trusted.has(chain[i]!)) return chain[i]!;
  }
  return chain[0] ?? remote;
}

function isIpAllowed(ip: string, allowlist?: string[]): boolean {
  if (!allowlist?.length) return true;
  return allowlist.map(normalizeIp).includes(normalizeIp(ip));
}

export function startWireGatewayServer(
  options: WireGatewayServerOptions
): Promise<{ close: () => void; url: string }> {
  const config = options.config;
  if (
    config.security.mtls_required &&
    (!config.listen.tls_cert || !config.listen.tls_key || !config.listen.tls_ca)
  ) {
    throw new Error("mtls_required requires listen.tls_cert, listen.tls_key, and listen.tls_ca");
  }
  const host = config.listen.host;
  const port = config.listen.port;
  const scheme = config.listen.tls_cert && config.listen.tls_key ? "https" : "http";
  const publicBaseUrl = options.publicBaseUrl ?? `${scheme}://${host}:${port}`;
  const client = options.internalClient ?? new WireInternalClient(config);
  const nonceLedger = new NonceLedger(
    options.nonceLedgerPath ?? join(getProtocolDataDir(), "wire-gateway-nonce-ledger.json")
  );
  const rateLimiter = new RateLimiter(config.security.rate_limit_per_min);
  const poller = createOutboundPoller(config, client);

  let peersCache: Awaited<ReturnType<WireInternalClient["getPeers"]>> = [];
  let nodePublicKey = "";

  async function refreshCaches(): Promise<void> {
    try {
      const [node, peers] = await Promise.all([client.getNode(), client.getPeers()]);
      nodePublicKey = node.node.protocol_public_key;
      peersCache = peers;
    } catch {
      /* keep stale cache */
    }
  }

  function authorizeProtectedRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): { ok: true; ip: string; clientOrgUri?: string } | { ok: false } {
    const ip = clientIp(req, config.security.trusted_proxies);
    if (!isIpAllowed(ip, config.security.ip_allowlist)) {
      appendWireGatewayAudit(config.audit.path, {
        recorded_at: new Date().toISOString(),
        action: "wire.auth_fail",
        reason: "ip_denied",
        gateway_id: config.node_id,
      });
      json(res, 403, { ok: false, error: "ip_denied" });
      return { ok: false };
    }

    const rate = rateLimiter.check(ip);
    if (!rate.allowed) {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(rate.retryAfterSec ?? 60),
      });
      res.end(JSON.stringify({ ok: false, error: "rate_limited" }));
      return { ok: false };
    }

    const mtls = verifyMtlsClient({
      socket: req.socket as TLSSocket,
      required: config.security.mtls_required,
      allowedOrgUris: config.security.mtls_allowed_org_uris,
    });
    if (!mtls.ok) {
      appendWireGatewayAudit(config.audit.path, {
        recorded_at: new Date().toISOString(),
        action: "wire.auth_fail",
        reason: mtls.reason ?? "mtls_required",
        gateway_id: config.node_id,
      });
      json(res, 401, { ok: false, error: "mtls_required" });
      return { ok: false };
    }

    return { ok: true, ip, clientOrgUri: mtls.client_org_uri };
  }

  async function handleInboundWire(
    res: ServerResponse,
    wire: WireMessage,
    clientOrgUri?: string
  ): Promise<void> {
    if (!checkTimestampSkew(wire.timestamp, config.security.timestamp_skew_sec)) {
      appendWireGatewayAudit(config.audit.path, {
        recorded_at: new Date().toISOString(),
        action: "wire.reject",
        event_id: wire.eventId,
        sender: wire.sender,
        reason: "timestamp_skew",
        gateway_id: config.node_id,
      });
      json(res, 403, { ok: false, error: "timestamp_skew" });
      return;
    }

    if (!wireReceiverIsLocal(wire, config)) {
      json(res, 403, { ok: false, error: "receiver_mismatch" });
      return;
    }

    const replay = nonceLedger.checkAndRecord(
      wire.sender,
      wire.nonce,
      config.security.nonce_ttl_sec
    );
    if (!replay.ok) {
      appendWireGatewayAudit(config.audit.path, {
        recorded_at: new Date().toISOString(),
        action: "wire.replay",
        event_id: wire.eventId,
        sender: wire.sender,
        reason: replay.reason,
        gateway_id: config.node_id,
      });
      json(res, 403, { ok: false, error: "replay" });
      return;
    }

    const sig = verifyInboundWireMessage(wire, peersCache, clientOrgUri);
    if (!sig.ok) {
      appendWireGatewayAudit(config.audit.path, {
        recorded_at: new Date().toISOString(),
        action: sig.reason === "signature_invalid" ? "wire.sig_fail" : "wire.reject",
        event_id: wire.eventId,
        sender: wire.sender,
        peer_node_id: sig.peerNodeId,
        reason: sig.reason,
        gateway_id: config.node_id,
      });
      json(res, 403, { ok: false, error: sig.reason ?? "signature_invalid" });
      return;
    }

    const envelope = wireMessageToEnvelope(wire);

    try {
      const { status, result } = await client.submitInbox({
        envelope,
        gateway_receipt: {
          received_at: new Date().toISOString(),
          peer_node_id: sig.peerNodeId,
          wire_nonce: wire.nonce,
        },
      });

      appendWireGatewayAudit(config.audit.path, {
        recorded_at: new Date().toISOString(),
        action: "wire.receive",
        event_id: wire.eventId,
        sender: wire.sender,
        receiver: wire.receiver,
        peer_node_id: sig.peerNodeId,
        hash: wire.hash,
        http_status: status,
        gateway_id: config.node_id,
      });

      if (status === 409 || result.idempotent) {
        json(res, 409, { ok: true, eventId: wire.eventId, idempotent: true });
        return;
      }

      json(res, 202, { ok: true, eventId: wire.eventId, accepted: true });
    } catch (e) {
      appendWireGatewayAudit(config.audit.path, {
        recorded_at: new Date().toISOString(),
        action: "internal.api_error",
        event_id: wire.eventId,
        reason: e instanceof Error ? e.message : String(e),
        gateway_id: config.node_id,
      });
      json(res, 503, { ok: false, error: "core_unavailable" });
    }
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const hostHeader = req.headers.host ?? `${host}:${port}`;
    const url = new URL(req.url ?? "/", `${scheme}://${hostHeader}`);

    if (req.method === "GET" && url.pathname === "/wire/v1/health") {
      json(res, 200, {
        ok: true,
        service: "wire-gateway",
        wire_version: config.wire_version,
        node_id: config.node_id,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/.well-known/wire-node.json") {
      const wellKnown = buildWireNodeWellKnown(config, publicBaseUrl, nodePublicKey);
      json(res, 200, wellKnown);
      return;
    }

    if (req.method === "GET" && url.pathname === "/wire/v1/federation/catalog") {
      const catalog = exportWireFederationGossipCatalog(config.node_id);
      catalog.nodes = listWireFederationCatalogWithGossip();
      json(res, 200, catalog);
      return;
    }

    if (req.method === "POST" && url.pathname === "/wire/v1/federation/gossip") {
      const access = authorizeProtectedRequest(req, res);
      if (!access.ok) return;
      try {
        const raw = await readBody(req);
        const remote = validateWireFederationGossipPost(JSON.parse(raw));
        if (!remote) {
          json(res, 400, { ok: false, error: "invalid_gossip_catalog" });
          return;
        }
        const publisherPeer = findPeerForSender(peersCache, remote.publisher_node_id);
        if (!publisherPeer) {
          json(res, 403, { ok: false, error: "gossip_peer_unknown" });
          return;
        }
        if (
          access.clientOrgUri &&
          findPeerForSender(peersCache, access.clientOrgUri)?.peer_node_id !==
            publisherPeer.peer_node_id
        ) {
          json(res, 403, { ok: false, error: "mtls_sender_mismatch" });
          return;
        }
        const store = applyIncomingWireFederationGossip(remote);
        appendWireGatewayAudit(config.audit.path, {
          recorded_at: new Date().toISOString(),
          action: "wire.receive",
          peer_node_id: remote.publisher_node_id,
          reason: `federation_gossip:${remote.nodes.length} nodes merged`,
          gateway_id: config.node_id,
        });
        json(res, 202, {
          ok: true,
          accepted: true,
          remote_nodes: remote.nodes.length,
          publisher: remote.publisher_node_id,
          merged_nodes: store.catalog.nodes.length,
        });
      } catch {
        json(res, 400, { ok: false, error: "invalid_json" });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/wire/v1/events") {
      const access = authorizeProtectedRequest(req, res);
      if (!access.ok) return;
      try {
        const raw = await readBody(req);
        const parsed = validateWireMessage(JSON.parse(raw), { verifyHash: true });
        if (!parsed.ok || !parsed.message) {
          json(res, 400, {
            ok: false,
            error: parsed.issues[0]?.code ?? "schema_invalid",
          });
          return;
        }
        await handleInboundWire(res, parsed.message, access.clientOrgUri);
      } catch (e) {
        json(res, 400, {
          ok: false,
          error: e instanceof Error ? e.message : "schema_invalid",
        });
      }
      return;
    }

    const pullMatch = url.pathname.match(/^\/wire\/v1\/events\/([0-9a-f-]{36})$/);
    if (req.method === "GET" && pullMatch) {
      const access = authorizeProtectedRequest(req, res);
      if (!access.ok) return;
      const eventId = pullMatch[1]!;
      const peerHeader = req.headers["x-wire-peer-id"];
      const peerNodeId = typeof peerHeader === "string" ? peerHeader : undefined;
      try {
        const pull = await client.getEventForPull(eventId, peerNodeId);
        if (!pull.allowed || !pull.envelope) {
          json(res, 404, { ok: false, error: pull.reason ?? "not_exportable" });
          return;
        }
        const wire = envelopeToWireMessage(pull.envelope);
        json(res, 200, wire);
      } catch (e) {
        json(res, 503, {
          ok: false,
          error: e instanceof Error ? e.message : "core_unavailable",
        });
      }
      return;
    }

    json(res, 404, { ok: false, error: "not found" });
  };

  let server;
  if (config.listen.tls_cert && config.listen.tls_key) {
    const httpsOptions: ServerOptions = {
      cert: readFileSync(config.listen.tls_cert, "utf-8"),
      key: readFileSync(config.listen.tls_key, "utf-8"),
      ca: config.listen.tls_ca ? readFileSync(config.listen.tls_ca, "utf-8") : undefined,
      requestCert: config.security.mtls_required,
      // Keep the TLS connection open so the application can return an auditable
      // 401; verifyMtlsClient still requires TLSSocket.authorized (CA verified).
      rejectUnauthorized: false,
    };
    server = createHttpsServer(httpsOptions, (req, res) => {
      handler(req, res).catch((e) => {
        json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    });
  } else {
    server = createHttpServer((req, res) => {
      handler(req, res).catch((e) => {
        json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    });
  }

  return new Promise((resolve, reject) => {
    void refreshCaches().finally(() => {
      if (options.enableOutbound !== false) {
        poller.start();
      }
      server.listen(port, host, () => {
        const addr = server.address();
        const actualPort = typeof addr === "object" && addr ? addr.port : port;
        resolve({
          url: `${scheme}://${host}:${actualPort}`,
          close: () => {
            poller.stop();
            server.close();
          },
        });
      });
      server.on("error", reject);
    });
  });
}
