/**
 * X-Road REST producer listener (Security Server → OrgOS).
 * Path: src/lib/wire/gov-gateway/producer-server.ts
 *
 * Loopback HTTP by default. TLS termination is expected at SS / reverse proxy.
 * SOAP is not implemented.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { GovGatewayProfileId } from "../../../../schemas/protocol/gov-gateway-adapter.js";
import { getTenantId } from "../../tenant.js";
import { ingestWebhook } from "../../webhook.js";
import {
  nativeMessageFromXRoadHttpRequest,
} from "./adapters/xroad-v7.js";
import { decodeOpenOrgOsMime, encodeOpenOrgOsMime, OPENORGOS_ENVELOPE_MIME } from "./encode-openorgos-mime.js";
import { appendGovGatewayAuditBridge } from "./audit-bridge.js";
import { loadGovGatewayConfig } from "./config.js";
import { isTrustedXRoadClient } from "./xroad-r1.js";
import type { EventEnvelope } from "../../../../schemas/protocol/org-event.js";

export interface GovGatewayProducerOptions {
  host?: string;
  port?: number;
  profileId?: GovGatewayProfileId;
  /** When true, skip peer trust check (tests only). */
  trustAllClients?: boolean;
}

export interface GovGatewayProducerHandle {
  close: () => void;
  port: number;
  url: string;
  host: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function headerMap(req: IncomingMessage): Record<string, string | string[] | undefined> {
  return req.headers as Record<string, string | string[] | undefined>;
}

function pickHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function buildNoticeAck(envelope: EventEnvelope, requestId: string): string {
  const ack: EventEnvelope = {
    protocol_version: envelope.protocol_version ?? "1",
    event_id: randomUUID(),
    occurred_at: new Date().toISOString(),
    origin: envelope.destination ?? envelope.origin,
    destination: envelope.origin,
    identity: envelope.identity,
    correlation_id: requestId,
    causation_id: envelope.event_id,
    event: {
      type: "steward.notice.ack",
      payload: {
        acked_event_id: envelope.event_id,
        service: "notice-ack",
      },
    },
    signature: null,
  };
  return encodeOpenOrgOsMime(ack);
}

function matchProducerPath(urlPath: string): { kind: "r1" | "producer"; service?: string } | null {
  if (urlPath.startsWith("/r1/")) {
    return { kind: "r1", service: urlPath.slice("/r1/".length) };
  }
  const producerPrefix = "/protocol/v1/gov-gateway/producer/";
  if (urlPath.startsWith(producerPrefix)) {
    return {
      kind: "producer",
      service: decodeURIComponent(urlPath.slice(producerPrefix.length)),
    };
  }
  return null;
}

export async function handleGovGatewayProducerRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: GovGatewayProducerOptions = {},
): Promise<void> {
  const profileId = opts.profileId ?? "xroad_v7";
  const urlPath = (req.url ?? "/").split("?")[0] ?? "/";

  if (req.method === "GET" && urlPath === "/health") {
    json(res, 200, { ok: true, profile_id: profileId, role: "xroad_producer" });
    return;
  }

  const matched = matchProducerPath(urlPath);
  if (req.method !== "POST" || !matched) {
    json(res, 404, { ok: false, error: "not found" });
    return;
  }

  const headers = headerMap(req);
  const client = pickHeader(headers, "X-Road-Client");
  if (!opts.trustAllClients && !isTrustedXRoadClient(client, profileId)) {
    json(res, 403, {
      ok: false,
      error: "unknown X-Road-Client",
      client: client ?? null,
    });
    return;
  }

  let bodyText: string;
  try {
    bodyText = await readBody(req);
  } catch (err) {
    json(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const contentType = pickHeader(headers, "Content-Type") ?? "";
  const native = nativeMessageFromXRoadHttpRequest({
    profileId,
    headers,
    bodyText,
  });

  let envelope: EventEnvelope;
  try {
    if (
      contentType.includes(OPENORGOS_ENVELOPE_MIME) ||
      contentType.includes("application/json") ||
      !contentType
    ) {
      envelope = decodeOpenOrgOsMime(native.body);
    } else {
      json(res, 422, { ok: false, error: `unsupported Content-Type: ${contentType}` });
      return;
    }
  } catch (err) {
    json(res, 422, {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      detail: "MIME decode failed — Wire SoT unchanged",
    });
    return;
  }

  const ingest = ingestWebhook({ raw: envelope });
  if (!ingest.ok) {
    json(res, 422, {
      ok: false,
      error: ingest.reason ?? "ingest failed",
      verificationIssues: ingest.verificationIssues,
    });
    return;
  }

  const requestId =
    pickHeader(headers, "X-Request-Id") ?? envelope.event_id;
  const ackBody = buildNoticeAck(envelope, requestId);
  const config = loadGovGatewayConfig();
  if (config?.audit_bridge) {
    appendGovGatewayAuditBridge({
      event_id: envelope.event_id,
      profile_id: profileId,
      receipt: {
        ok: true,
        http_status: 200,
        correlation_id: requestId,
        native_message_id: requestId,
        detail: "producer_ingest",
      },
      bridge: config.audit_bridge,
    });
  }

  res.writeHead(200, {
    "Content-Type": OPENORGOS_ENVELOPE_MIME,
    "X-Request-Id": requestId,
    "X-Road-Client": client ?? "",
  });
  res.end(ackBody);
}

export function startGovGatewayProducerServer(
  options: GovGatewayProducerOptions = {},
): Promise<GovGatewayProducerHandle> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 9474;
  const server = createServer((req, res) => {
    void handleGovGatewayProducerRequest(req, res, options).catch((err) => {
      json(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort =
        typeof addr === "object" && addr && "port" in addr ? addr.port : port;
      const url = `http://${host}:${actualPort}`;
      console.log(
        `✓ Gov Gateway X-Road producer ${url} · tenant=${getTenantId()} · profile=${options.profileId ?? "xroad_v7"}`,
      );
      resolve({
        host,
        port: actualPort,
        url,
        close: () => server.close(),
      });
    });
    server.on("error", reject);
  });
}
