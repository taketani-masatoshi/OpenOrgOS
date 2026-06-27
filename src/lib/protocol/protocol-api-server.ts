import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer, type ServerOptions } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import type { TLSSocket } from "node:tls";
import { exportInboxEntries, exportOutboxEntries } from "./inbox-export.js";
import { listWireRelayPending, markWireRelayDelivered } from "./wire-relay-store.js";
import { getWitnessTrustBundlePath } from "./paths.js";
import { ingestWebhook } from "../webhook.js";
import { getTenantId, setTenantId } from "../tenant.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { ProtocolApiServerConfig } from "../../../schemas/protocol/protocol-api-config.js";
import {
  buildTlsConnectOptions,
  routeRequiresMtls,
  trustBundleRoutePublic,
  verifyMtlsClient,
} from "./protocol-tls.js";

export interface ProtocolApiServerOptions {
  host?: string;
  port?: number;
  trustBundlePath?: string;
  config?: ProtocolApiServerConfig;
  /** Pin tenant for inbox/outbox export (multi-tenant pull demos). */
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

function checkMtlsAccess(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  config: ProtocolApiServerConfig
): boolean {
  if (!config.mtls_required) return true;
  if (trustBundleRoutePublic(pathname) && config.trust_bundle_public) return true;
  if (!routeRequiresMtls(pathname)) return true;

  const socket = req.socket as TLSSocket;
  const result = verifyMtlsClient({
    socket,
    required: true,
    allowedOrgUris: config.mtls_allowed_org_uris,
  });
  if (!result.ok) {
    json(res, 401, { ok: false, error: result.reason ?? "mTLS required" });
    return false;
  }
  return true;
}

async function handleProtocolApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: ProtocolApiServerConfig,
  trustBundlePath?: string
): Promise<void> {
  const host = config.host;
  const port = config.port;
  const url = new URL(req.url ?? "/", `http://${host}:${port}`);

  if (!checkMtlsAccess(req, res, url.pathname, config)) return;

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      service: "protocol-api",
      tls: !!config.tls,
      mtls_required: config.mtls_required,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/protocol/v1/inbox") {
    const since = url.searchParams.get("since") ?? undefined;
    const limit = url.searchParams.get("limit");
    const entries = exportInboxEntries({
      since,
      limit: limit ? Number(limit) : 50,
    });
    json(res, 200, {
      ok: true,
      entries: entries.map((e) => ({
        event_id: e.event_id,
        envelope_digest: e.envelope_digest,
        recorded_at: e.recorded_at,
        envelope: e.envelope,
      })),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/protocol/v1/outbox") {
    const since = url.searchParams.get("since") ?? undefined;
    const limit = url.searchParams.get("limit");
    const entries = exportOutboxEntries({
      since,
      limit: limit ? Number(limit) : 50,
    });
    json(res, 200, {
      ok: true,
      entries: entries.map((e) => ({
        event_id: e.event_id,
        envelope_digest: e.envelope_digest,
        recorded_at: e.recorded_at,
        envelope: e.envelope,
      })),
    });
    return;
  }

  const outboxMatch = url.pathname.match(/^\/protocol\/v1\/outbox\/([0-9a-f-]{36})$/);
  if (req.method === "GET" && outboxMatch) {
    const eventId = outboxMatch[1]!;
    const entries = exportOutboxEntries().filter((e) => e.event_id === eventId);
    if (entries.length === 0) {
      json(res, 404, { ok: false, error: "not found" });
      return;
    }
    json(res, 200, { ok: true, envelope: entries[0]!.envelope });
    return;
  }

  if (req.method === "GET" && url.pathname === "/protocol/v1/trust/bundle") {
    const bundlePath = trustBundlePath ?? getWitnessTrustBundlePath();
    if (!existsSync(bundlePath)) {
      json(res, 404, { ok: false, error: "trust bundle not published" });
      return;
    }
    const bundle = JSON.parse(readFileSync(bundlePath, "utf-8"));
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    });
    res.end(JSON.stringify(bundle));
    return;
  }

  if (req.method === "GET" && url.pathname === "/protocol/v1/relay/inbox") {
    const destination = url.searchParams.get("destination_org_uri") ?? undefined;
    const pending = listWireRelayPending(destination ?? undefined);
    json(res, 200, { ok: true, queue: pending });
    return;
  }

  if (req.method === "POST" && url.pathname === "/protocol/v1/relay/enqueue") {
    try {
      const raw = await readBody(req);
      const data = JSON.parse(raw) as { envelope?: EventEnvelope; destination_org_uri?: string };
      if (!data.envelope) {
        json(res, 422, { ok: false, error: "envelope required" });
        return;
      }
      const ingest = ingestWebhook({ raw: data.envelope });
      if (!ingest.ok && ingest.reason !== "idempotent") {
        json(res, 422, { ok: false, ...ingest });
        return;
      }
      json(res, 202, { ok: true, event_id: data.envelope.event_id, ingest });
      return;
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/protocol/v1/relay/ack") {
    try {
      const raw = await readBody(req);
      const data = JSON.parse(raw) as { relay_id?: string };
      if (!data.relay_id) {
        json(res, 422, { ok: false, error: "relay_id required" });
        return;
      }
      markWireRelayDelivered(data.relay_id);
      json(res, 200, { ok: true });
      return;
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }
  }

  json(res, 404, { ok: false, error: "not found" });
}

export function startProtocolApiServer(
  options: ProtocolApiServerOptions = {}
): Promise<{ close: () => void; url: string }> {
  const config =
    options.config ??
    ({
      host: options.host ?? "127.0.0.1",
      port: options.port ?? 9476,
      mtls_required: false,
      mtls_allowed_org_uris: [],
      trust_bundle_public: true,
    } satisfies ProtocolApiServerConfig);

  const pinnedTenant = options.tenantId ?? getTenantId();

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const previousTenant = getTenantId();
    setTenantId(pinnedTenant);
    handleProtocolApiRequest(req, res, config, options.trustBundlePath)
      .catch((e) => {
        json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
      })
      .finally(() => {
        setTenantId(previousTenant);
      });
  };

  let server;
  if (config.tls) {
    const tlsMaterial = buildTlsConnectOptions(config.tls);
    const httpsOptions: ServerOptions = {
      cert: tlsMaterial.cert,
      key: tlsMaterial.key,
      ca: tlsMaterial.ca,
      requestCert: config.mtls_required,
      rejectUnauthorized: false,
    };
    server = createHttpsServer(httpsOptions, handler);
  } else {
    server = createHttpServer(handler);
  }

  const scheme = config.tls ? "https" : "http";
  return new Promise((resolve, reject) => {
    server.listen(config.port, config.host, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : config.port;
      resolve({
        url: `${scheme}://${config.host}:${actualPort}`,
        close: () => server.close(),
      });
    });
    server.on("error", reject);
  });
}
