import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer as createHttpsServer, type ServerOptions } from "node:https";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TLSSocket } from "node:tls";
import { exportInboxEntries, exportOutboxEntries } from "./inbox-export.js";
import {
  listWireRelayPending,
  markWireRelayDelivered,
  enqueueWireRelay,
} from "./wire-relay-store.js";
import { getWitnessTrustBundlePath, getProtocolRelayStoreDir } from "./paths.js";
import { loadTransactionsRegistry } from "./transactions.js";
import { loadRelayState } from "./relay-state.js";
import { listWirePending } from "./wire-queue.js";
import { listWitnessPending } from "./witness-queue.js";
import { countOpenReconcileAlerts } from "./reconcile-alerts-store.js";
import { getTenantId, setTenantId } from "../tenant.js";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { serializeEventEnvelope } from "./envelope.js";
import { envelopeDigest } from "./canonical.js";
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

  if (req.method === "GET" && url.pathname === "/protocol/v1/metrics") {
    const relayState = loadRelayState();
    json(res, 200, {
      ok: true,
      service: "protocol-api",
      wire_pending: listWirePending().length,
      witness_pending: listWitnessPending().length,
      reconcile_alerts_open: countOpenReconcileAlerts(),
      relay_cycles: relayState.cycles ?? 0,
      relay_last_run_at: relayState.last_run_at ?? null,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/protocol/v1/ledger") {
    const since = url.searchParams.get("since") ?? undefined;
    const peerId = url.searchParams.get("peer_id") ?? undefined;
    const registry = loadTransactionsRegistry();
    const entries = registry.transactions
      .filter((t) => {
        if (since && t.recorded_at.slice(0, 10) < since) return false;
        if (peerId && t.counterparty.org_id !== peerId) return false;
        return true;
      })
      .map((t) => ({
        event_id: t.event_id,
        transaction_id: t.transaction_id,
        recorded_at: t.recorded_at,
        direction: t.direction,
        peer_id: t.counterparty.org_id,
        contract_id: t.refs.contract_id,
      }));
    json(res, 200, { ok: true, entries });
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
    json(res, 200, {
      ok: true,
      queue: pending.map((q) => ({
        ...q,
        envelope:
          q.envelope_path && existsSync(q.envelope_path)
            ? JSON.parse(readFileSync(q.envelope_path, "utf-8"))
            : undefined,
      })),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/protocol/v1/relay/enqueue") {
    try {
      const raw = await readBody(req);
      const data = JSON.parse(raw) as { envelope?: EventEnvelope; destination_org_uri?: string };
      if (!data.envelope || !data.destination_org_uri) {
        json(res, 422, { ok: false, error: "envelope and destination_org_uri required" });
        return;
      }
      const storeDir = getProtocolRelayStoreDir();
      mkdirSync(storeDir, { recursive: true });
      const envPath = join(storeDir, `${data.envelope.event_id}.json`);
      writeFileSync(envPath, serializeEventEnvelope(data.envelope), "utf-8");
      const originOrgUri =
        data.envelope.origin.org_uri ??
        (data.envelope.origin.org_id.startsWith("PEER-")
          ? data.envelope.origin.org_id
          : `steward://tenant/${data.envelope.origin.org_id}`);
      const record = enqueueWireRelay({
        origin_org_uri: originOrgUri,
        destination_org_uri: data.destination_org_uri,
        event_id: data.envelope.event_id,
        envelope_digest: envelopeDigest(data.envelope),
        envelope_path: envPath,
      });
      json(res, 202, { ok: true, relay_id: record.relay_id, event_id: data.envelope.event_id });
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

  const communityRoute = await (async () => {
    const raw = req.method === "GET" ? "" : await readBody(req);
    const { handleCommunityWireNodeApiRoute } = await import("./community-wire-node-api.js");
    const wire = await handleCommunityWireNodeApiRoute(req.method ?? "GET", url.pathname, raw, req);
    if (wire) return wire;
    const { handleCommunityTenantMailApiRoute } = await import("./community-tenant-mail-api.js");
    return handleCommunityTenantMailApiRoute(
      req.method ?? "GET",
      url.pathname,
      raw,
      req,
      url.searchParams
    );
  })();
  if (communityRoute) {
    json(res, communityRoute.status, communityRoute.body);
    return;
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
