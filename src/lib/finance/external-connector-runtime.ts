import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { appendJsonl, loadJsonl } from "../jsonl-store.js";
import { getDataDir } from "../utils.js";
import type { ExternalFinanceTransaction } from "../../../schemas/finance/external-transaction.js";
import { externalTransactionIdempotencyKey } from "./external-reconciliation.js";

export type ExternalTransactionStore = {
  has(key: string): Promise<boolean>;
  put(key: string, transaction: ExternalFinanceTransaction): Promise<void>;
};

export type OutboxEntry = {
  id: string;
  idempotency_key: string;
  transaction: ExternalFinanceTransaction;
  attempts: number;
  next_attempt_at: string;
  status: "PENDING" | "SENT" | "FAILED";
};

export type OpenOrgOSWriter = (entry: OutboxEntry) => Promise<void>;

export function createOpenOrgOSWriter(input: { baseUrl: string; bearerToken: string; operatorId: string; permission: "finance:reconcile"; path?: string }): OpenOrgOSWriter {
  if (!input.baseUrl.startsWith("https://") && !input.baseUrl.startsWith("http://localhost")) throw new Error("OpenOrgOS base URL must use HTTPS outside localhost");
  return async (entry) => {
    const response = await fetch(`${input.baseUrl.replace(/\/$/, "")}${input.path ?? "/api/finance/external-transactions"}`, { method: "POST", headers: { authorization: `Bearer ${input.bearerToken}`, "content-type": "application/json", "x-operator-id": input.operatorId, "x-required-permission": input.permission, "idempotency-key": entry.idempotency_key }, body: JSON.stringify({ transaction: entry.transaction, source_event_id: entry.id, mode: "proposal" }) });
    if (!response.ok) throw new Error(`OpenOrgOS finance write failed: HTTP ${response.status}`);
  };
}

/** Append-only JSONL implementation. Use one instance per tenant workspace. */
export class JsonlExternalTransactionStore implements ExternalTransactionStore {
  private readonly path: string;
  constructor(baseDir = getDataDir()) {
    this.path = join(baseDir, "external-finance", "transactions.jsonl");
  }
  async has(key: string): Promise<boolean> {
    return loadJsonl<{ idempotency_key?: string }>(this.path, (raw) => raw as { idempotency_key?: string })
      .some((record) => record.idempotency_key === key);
  }
  async put(key: string, transaction: ExternalFinanceTransaction): Promise<void> {
    appendJsonl(this.path, { idempotency_key: key, transaction, recorded_at: new Date().toISOString() });
  }
}

export class JsonlExternalOutbox {
  private readonly path: string;
  constructor(baseDir = getDataDir()) {
    this.path = join(baseDir, "external-finance", "outbox.jsonl");
  }
  async enqueue(entry: OutboxEntry): Promise<void> {
    appendJsonl(this.path, entry);
  }
  load(): OutboxEntry[] {
    return loadJsonl<OutboxEntry>(this.path, (raw) => raw as OutboxEntry);
  }
}

export async function ingestExternalTransaction(
  transaction: ExternalFinanceTransaction,
  store: ExternalTransactionStore,
  enqueue: (entry: OutboxEntry) => Promise<void>,
): Promise<{ duplicate: boolean; idempotency_key: string }> {
  const idempotency_key = externalTransactionIdempotencyKey(transaction);
  if (await store.has(idempotency_key)) return { duplicate: true, idempotency_key };
  await store.put(idempotency_key, transaction);
  await enqueue({
    id: idempotency_key,
    idempotency_key,
    transaction,
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    status: "PENDING",
  });
  return { duplicate: false, idempotency_key };
}

export function verifyHmacSha256(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const supplied = signature.replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

export async function deliverOutboxEntry(entry: OutboxEntry, writer: OpenOrgOSWriter): Promise<OutboxEntry> {
  try {
    await writer(entry);
    return { ...entry, status: "SENT" };
  } catch {
    const attempts = entry.attempts + 1;
    const delayMs = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(attempts, 10));
    return { ...entry, attempts, status: attempts >= 10 ? "FAILED" : "PENDING", next_attempt_at: new Date(Date.now() + delayMs).toISOString() };
  }
}

export async function drainExternalOutbox(entries: OutboxEntry[], writer: OpenOrgOSWriter): Promise<OutboxEntry[]> {
  const due = entries.filter((entry) => entry.status === "PENDING" && entry.next_attempt_at <= new Date().toISOString());
  return Promise.all(due.map((entry) => deliverOutboxEntry(entry, writer)));
}

export function startExternalWebhookServer(
  port: number,
  onEvent: (provider: string, rawBody: string, headers: Record<string, string | string[] | undefined>) => Promise<void>,
) {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || !req.url?.startsWith("/webhooks/")) { res.statusCode = 404; res.end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    try {
      const provider = req.url.slice("/webhooks/".length).split("/")[0] ?? "unknown";
      await onEvent(provider, Buffer.concat(chunks).toString("utf8"), req.headers);
      res.statusCode = 202; res.end("accepted");
    } catch { res.statusCode = 400; res.end("invalid webhook"); }
  });
  server.listen(port);
  return server;
}

export function startExternalCron(intervalMs: number, task: () => Promise<void>): NodeJS.Timeout {
  return setInterval(() => { void task().catch(() => undefined); }, intervalMs);
}
