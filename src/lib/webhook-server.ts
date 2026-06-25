import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadWebhookRegistry } from "./webhook.js";
import { ingestWebhook } from "./webhook.js";
import { runQueueDrainInternal } from "./queue-processor.js";

export interface WebhookServerOptions {
  host?: string;
  port?: number;
  drain?: boolean;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

export function startWebhookServer(options: WebhookServerOptions = {}): Promise<{ close: () => void }> {
  const registry = loadWebhookRegistry();
  const inbound = registry.inbound;
  if (!inbound?.enabled) {
    throw new Error("webhook inbound disabled — set inbound.enabled in steward/platform/webhook/registry.yaml");
  }

  const host = options.host ?? inbound.host ?? "127.0.0.1";
  const port = options.port ?? inbound.port ?? 9473;
  const path = inbound.path ?? "/steward/webhook";

  const server = createServer(async (req, res) => {
    await handleRequest(req, res, path, options.drain ?? true);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`✓ Webhook server http://${host}:${port}${path}`);
      resolve({
        close: () => server.close(),
      });
    });
    server.on("error", reject);
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedPath: string,
  drain: boolean
): Promise<void> {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== "POST" || req.url !== expectedPath) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  try {
    const raw = await readBody(req);
    const data = JSON.parse(raw) as {
      event: string;
      ref?: string;
      payload?: Record<string, unknown>;
      secret?: string;
    };
    const headerSecret = req.headers["x-steward-secret"];
    const secret =
      typeof headerSecret === "string" ? headerSecret : data.secret;

    const result = ingestWebhook({
      event: data.event,
      ref: data.ref,
      payload: data.payload,
      secret,
    });

    if (!result.ok) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    if (drain) {
      runQueueDrainInternal({ dryRun: false });
    }

    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, queue_id: result.queueId }));
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}
