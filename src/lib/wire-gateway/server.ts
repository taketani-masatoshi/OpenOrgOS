import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer, type ServerOptions } from "node:https";
import { readFileSync } from "node:fs";
import type { WireGatewayConfig } from "../../../schemas/protocol/wire-gateway-config.js";
import type { WireMessage } from "../../../schemas/protocol/wire-message.js";
import { WireInternalClient } from "./internal-client.js";
import { createOutboundPoller } from "./outbound-poller.js";
import { NonceLedger } from "./nonce-ledger.js";
import { RateLimiter } from "./rate-limit.js";
import { appendWireGatewayAudit } from "./audit.js";
import {
  buildWireNodeWellKnown,
  validateWireMessage,
} from "./validate.js";
import {
  checkTimestampSkew,
  verifyInboundWireMessage,
} from "./security.js";
import { envelopeToWireMessage, wireMessageToEnvelope } from "./codec.js";
import { join } from "node:path";
import { getProtocolDataDir } from "../protocol/paths.js";

export interface WireGatewayServerOptions {
  config: WireGatewayConfig;
  publicBaseUrl?: string;
  enableOutbound?: boolean;
  internalClient?: WireInternalClient;
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

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

function isIpAllowed(ip: string, allowlist?: string[]): boolean {
  if (!allowlist?.length) return true;
  return allowlist.includes(ip);
}

export function startWireGatewayServer(
  options: WireGatewayServerOptions
): Promise<{ close: () => void; url: string }> {
  const config = options.config;
  const host = config.listen.host;
  const port = config.listen.port;
  const scheme = config.listen.tls_cert && config.listen.tls_key ? "https" : "http";
  const publicBaseUrl = options.publicBaseUrl ?? `${scheme}://${host}:${port}`;
  const client = options.internalClient ?? new WireInternalClient(config);
  const nonceLedger = new NonceLedger(
    join(getProtocolDataDir(), "wire-gateway-nonce-ledger.json")
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

  async function handleInboundWire(
    req: IncomingMessage,
    res: ServerResponse,
    wire: WireMessage
  ): Promise<void> {
    const ip = clientIp(req);
    if (!isIpAllowed(ip, config.security.ip_allowlist)) {
      appendWireGatewayAudit(config.audit.path, {
        recorded_at: new Date().toISOString(),
        action: "wire.auth_fail",
        reason: "ip_denied",
        gateway_id: config.node_id,
      });
      json(res, 403, { ok: false, error: "ip_denied" });
      return;
    }

    const rate = rateLimiter.check(ip);
    if (!rate.allowed) {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(rate.retryAfterSec ?? 60),
      });
      res.end(JSON.stringify({ ok: false, error: "rate_limited" }));
      return;
    }

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

    const sig = verifyInboundWireMessage(wire, peersCache);
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

    if (req.method === "POST" && url.pathname === "/wire/v1/events") {
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
        await handleInboundWire(req, res, parsed.message);
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
      requestCert: config.security.mtls_required,
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
