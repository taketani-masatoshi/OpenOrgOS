import {
  formatWebhookConfig,
  ingestWebhook,
  sendWebhook,
  loadWebhookRegistry,
} from "../lib/webhook.js";
import { setTenantId } from "../lib/tenant.js";
import { readFileSync, existsSync } from "node:fs";
import { startWebhookServer } from "../lib/webhook-server.js";

export function runWebhookConfig(): void {
  console.log(formatWebhookConfig());
}

export interface WebhookSendOptions {
  event: string;
  ref?: string;
  payload?: string;
  tenant?: string;
}

export async function runWebhookSend(opts: WebhookSendOptions): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  let payload: Record<string, unknown> = { ref: opts.ref };
  if (opts.payload) {
    if (existsSync(opts.payload)) {
      payload = { ...payload, ...JSON.parse(readFileSync(opts.payload, "utf-8")) };
    } else {
      payload = { ...payload, raw: opts.payload };
    }
  }
  const result = await sendWebhook(opts.event, payload);
  if (result.sent) {
    console.log(`✓ webhook sent · ${opts.event}`);
  } else {
    console.log(`⚠ ${result.reason}`);
  }
}

export interface WebhookIngestOptions {
  file: string;
  secret?: string;
}

export interface WebhookServeOptions {
  host?: string;
  port?: number;
  once?: boolean;
}

export async function runWebhookServe(opts: WebhookServeOptions): Promise<void> {
  const registry = loadWebhookRegistry();
  const inbound = registry.inbound;
  const host = opts.host ?? inbound?.host ?? "127.0.0.1";
  const port = opts.port ?? inbound?.port ?? 9473;
  const { close } = await startWebhookServer({
    host,
    port,
    drain: !opts.once,
  });

  if (opts.once) {
    const res = await fetch(`http://${host}:${port}/health`);
    if (!res.ok) {
      close();
      console.error(`Health check failed: HTTP ${res.status}`);
      process.exit(1);
    }
    const body = (await res.json()) as { ok?: boolean };
    if (!body.ok) {
      close();
      console.error("Health check failed: body.ok !== true");
      process.exit(1);
    }
    console.log("✓ webhook health ok");
    close();
    return;
  }

  console.log("Press Ctrl+C to stop");
  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      close();
      resolve();
    });
  });
}

export function runWebhookIngest(opts: WebhookIngestOptions): void {
  if (!existsSync(opts.file)) {
    console.error(`File not found: ${opts.file}`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(opts.file, "utf-8")) as Record<string, unknown>;
  const result = ingestWebhook({
    event: typeof data.event === "string" ? data.event : undefined,
    ref: typeof data.ref === "string" ? data.ref : undefined,
    payload: (data.payload as Record<string, unknown>) ?? undefined,
    secret: opts.secret ?? (typeof data.secret === "string" ? data.secret : undefined),
    raw: data,
  });
  if (result.ok) {
    const idem = result.idempotent ? " · idempotent" : "";
    console.log(
      `✓ ingested · queue ${result.queueId}${result.transactionId ? ` · tx ${result.transactionId}` : ""}${result.inboxPath ? ` · inbox ${result.inboxPath}` : ""}${idem}`
    );
  } else {
    console.error(result.reason);
    process.exit(1);
  }
}
