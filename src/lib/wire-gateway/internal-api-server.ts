import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { exportOutboxEntries } from "../protocol/inbox-export.js";
import { exportProtocolPublicKeyBase64 } from "../protocol/signing.js";
import { ourOrgRef } from "../protocol/identity.js";
import { loadPeersRegistry, resolvePeerInboundEndpoints } from "../protocol/peers.js";
import { inferPeerTransport } from "../../../schemas/protocol/peer-endpoint.js";
import { mirrorInboundEnvelope } from "../protocol/transport.js";
import { isEventDelivered, markWireDelivered } from "../protocol/wire-delivered.js";
import { verifyInboundProtocolEnvelope } from "../protocol/inbound-verify.js";
import { getProtocolDataDir, getProtocolInboxDir } from "../protocol/paths.js";
import { getTenantId, setTenantId } from "../tenant.js";
import { readYamlFile } from "../utils.js";
import { wireExportPolicySchema } from "../../../schemas/protocol/wire-export-policy.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { InternalWireInboxSubmit } from "../../../schemas/protocol/wire-gateway-internal.js";
import { internalWireDeliveryReportSchema } from "../../../schemas/protocol/wire-gateway-internal.js";
import { loadOrgIdentityProfile } from "../org/identity-profile.js";
import { resolveOpenOrgDid } from "../../../schemas/protocol/openorg-did.js";
import { resolveWireTrustNode } from "../protocol/wire-trust-registry.js";
import { loadWireGatewayConfig } from "./validate.js";

export interface WireInternalApiServerOptions {
  host?: string;
  port?: number;
  bearerToken?: string;
  tenantId?: string;
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

function checkAuth(req: IncomingMessage, res: ServerResponse, bearerToken?: string): boolean {
  if (!bearerToken) return true;
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    json(res, 401, { ok: false, error: "unauthorized", code: "unauthorized" });
    return false;
  }
  const token = header.slice("Bearer ".length).trim();
  if (token !== bearerToken) {
    json(res, 401, { ok: false, error: "unauthorized", code: "unauthorized" });
    return false;
  }
  return true;
}

function resolvePeerDid(peer: {
  peer_id: string;
  org_uri?: string;
  did?: string;
}): string | undefined {
  if (peer.did) return peer.did;
  const fromRegistry =
    resolveWireTrustNode(peer.org_uri ?? "") ??
    resolveWireTrustNode(resolvePeerNodeId(peer));
  return fromRegistry?.node.did;
}

function resolvePeerNodeId(peer: {
  peer_id: string;
  org_uri?: string;
  display_name: string;
}): string {
  if (peer.org_uri?.startsWith("steward://tenant/")) {
    const tenant = peer.org_uri.replace("steward://tenant/", "");
    return tenant;
  }
  return peer.org_uri ?? peer.peer_id;
}

function resolveWireEndpoint(peer: ReturnType<typeof loadPeersRegistry>["peers"][number]): string | undefined {
  const endpoints = resolvePeerInboundEndpoints(peer);
  const wireEp = endpoints.find((ep) => ep.url.includes("/wire/v1/events"));
  if (wireEp) return wireEp.url;
  const push = endpoints.find((ep) => ep.mode === "push");
  if (push) return push.url;
  return peer.inbound_webhook_url;
}

function loadExportPolicy() {
  const path = join(getProtocolDataDir(), "wire-export-policy.yaml");
  if (!existsSync(path)) {
    return wireExportPolicySchema.parse({});
  }
  return readYamlFile(path, wireExportPolicySchema);
}

function isExportAllowed(eventId: string, envelope: EventEnvelope, peerNodeId?: string): boolean {
  const policy = loadExportPolicy();
  if (!peerNodeId) return policy.default_allowed;
  const rule = policy.rules.find((r) => r.peer_node_id === peerNodeId);
  const allowed = rule?.allowed ?? policy.default_allowed;
  if (!allowed) return false;
  if (rule?.event_types?.length) {
    return rule.event_types.includes(envelope.event.type);
  }
  return true;
}

function inboxHasEvent(eventId: string): boolean {
  return existsSync(join(getProtocolInboxDir(), `${eventId}.json`));
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  bearerToken?: string
): Promise<void> {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);

  if (!url.pathname.startsWith("/internal/v1/wire")) {
    json(res, 404, { ok: false, error: "not found" });
    return;
  }

  const subpath = url.pathname.slice("/internal/v1/wire".length) || "/";

  if (!checkAuth(req, res, bearerToken)) return;

  if (req.method === "GET" && subpath === "/node") {
    const orgRef = ourOrgRef();
    const profile = loadOrgIdentityProfile();
    const publicKey = exportProtocolPublicKeyBase64();
    if (!publicKey) {
      json(res, 503, { ok: false, error: "signing key unavailable", code: "core_unavailable" });
      return;
    }
    const gatewayConfig = loadWireGatewayConfig();
    const did = resolveOpenOrgDid({
      configured: gatewayConfig?.did,
      tenantId: getTenantId(),
      publicKeyBase64: publicKey,
    });
    json(res, 200, {
      ok: true,
      node: {
        node_id: orgRef.org_id,
        node_uri: orgRef.org_uri,
        display_name: profile.display_name,
        protocol_public_key: publicKey,
        wire_version: "0.1",
        did,
        trust_registry_url: gatewayConfig?.trust_registry_url,
      },
    });
    return;
  }

  if (req.method === "GET" && subpath === "/peers") {
    const peers = loadPeersRegistry().peers
      .map((peer) => {
        const endpoints = resolvePeerInboundEndpoints(peer);
        const preferred =
          endpoints.find((e) => e.transport === "wire_v1") ??
          endpoints.find((e) => e.mode === "push") ??
          endpoints[0];
        const wireEndpoint = preferred?.url ?? resolveWireEndpoint(peer);
        const hasKey = !!peer.protocol_public_key;
        if (!wireEndpoint && !hasKey) return null;
        const transport = preferred
          ? inferPeerTransport(preferred)
          : wireEndpoint?.includes("/wire/v1/events")
            ? "wire_v1"
            : "legacy_webhook";
        return {
          peer_node_id: resolvePeerNodeId(peer),
          peer_id: peer.peer_id,
          peer_node_uri: peer.org_uri,
          peer_did: resolvePeerDid(peer),
          display_name: peer.display_name,
          protocol_public_key: peer.protocol_public_key,
          wire_endpoint: wireEndpoint,
          transport,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
    json(res, 200, { ok: true, peers });
    return;
  }

  if (req.method === "GET" && subpath === "/outbox") {
    const pending = exportOutboxEntries()
      .filter((e) => !isEventDelivered(e.event_id))
      .map((e) => ({
        event_id: e.event_id,
        receiver_node_id:
          e.envelope.destination?.org_id ??
          e.envelope.destination?.org_uri?.replace("steward://tenant/", "") ??
          "unknown",
        enqueued_at: e.recorded_at,
        envelope_digest: e.envelope_digest,
      }));
    json(res, 200, { ok: true, pending });
    return;
  }

  const outboxMatch = subpath.match(/^\/outbox\/([0-9a-f-]{36})$/);
  if (req.method === "GET" && outboxMatch) {
    const eventId = outboxMatch[1]!;
    const entry = exportOutboxEntries().find((e) => e.event_id === eventId);
    if (!entry || isEventDelivered(eventId)) {
      json(res, 404, { ok: false, error: "not found", code: "not_found" });
      return;
    }
    json(res, 200, { ok: true, envelope: entry.envelope });
    return;
  }

  const deliveredMatch = subpath.match(/^\/outbox\/([0-9a-f-]{36})\/delivered$/);
  if (req.method === "POST" && deliveredMatch) {
    try {
      const raw = await readBody(req);
      const body = internalWireDeliveryReportSchema.parse(JSON.parse(raw));
      if (body.delivered && body.peer_node_id) {
        markWireDelivered(body.peer_node_id, body.event_id);
      }
      json(res, 200, { ok: true });
    } catch (e) {
      json(res, 400, {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: "schema_invalid",
      });
    }
    return;
  }

  if (req.method === "POST" && subpath === "/inbox") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw) as InternalWireInboxSubmit;
      const envelope = body.envelope;
      if (inboxHasEvent(envelope.event_id)) {
        json(res, 409, {
          ok: true,
          event_id: envelope.event_id,
          idempotent: true,
        });
        return;
      }
      const verification = verifyInboundProtocolEnvelope(envelope);
      if (!verification.ok) {
        json(res, 400, {
          ok: false,
          error: verification.issues.join("; "),
          code: "schema_invalid",
        });
        return;
      }
      mirrorInboundEnvelope(envelope);
      json(res, 202, {
        ok: true,
        event_id: envelope.event_id,
        idempotent: false,
      });
    } catch (e) {
      json(res, 400, {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: "schema_invalid",
      });
    }
    return;
  }

  const eventMatch = subpath.match(/^\/events\/([0-9a-f-]{36})$/);
  if (req.method === "GET" && eventMatch) {
    const eventId = eventMatch[1]!;
    const peerNodeId = req.headers["x-wire-peer-id"];
    const peerId = typeof peerNodeId === "string" ? peerNodeId : undefined;
    const entry = exportOutboxEntries().find((e) => e.event_id === eventId);
    if (!entry) {
      json(res, 200, { ok: true, allowed: false, reason: "not_found" });
      return;
    }
    if (!isExportAllowed(eventId, entry.envelope, peerId)) {
      json(res, 200, { ok: true, allowed: false, reason: "not_exportable" });
      return;
    }
    json(res, 200, { ok: true, allowed: true, envelope: entry.envelope });
    return;
  }

  json(res, 404, { ok: false, error: "not found" });
}

export function startWireInternalApiServer(
  options: WireInternalApiServerOptions = {}
): Promise<{ close: () => void; url: string }> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8080;
  const bearerToken = options.bearerToken;
  const tenantId = options.tenantId;

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const previousTenant = getTenantId();
    if (tenantId) setTenantId(tenantId);
    handleRequest(req, res, bearerToken)
      .catch((e) => {
        json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        setTenantId(previousTenant);
      });
  };

  const server = createHttpServer(handler);
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const boundPort =
        addr && typeof addr === "object" ? addr.port : port;
      resolve({
        url: `http://${host}:${boundPort}/internal/v1/wire`,
        close: () => server.close(),
      });
    });
    server.on("error", reject);
  });
}
