import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  appendModuleMessage,
  listPendingModuleMessagesFor,
  parseModuleMessageYaml,
} from "../lib/module-messages/store.js";
import { buildIntegrationTowerBriefLines } from "../lib/dispatch-tower/inventory.js";
import type { ModuleMessage } from "../../schemas/module-message.js";

function newMessageId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = randomBytes(4).toString("hex");
  return `MSG-${date}-${suffix}`;
}

export function runModuleMessageSend(opts: {
  from: string;
  fromKind?: "agent" | "module" | "integration";
  to: string;
  toKind?: "agent" | "module" | "integration";
  intent: ModuleMessage["intent"];
  summary: string;
  workOrderId?: string;
  json?: boolean;
}): void {
  const message: ModuleMessage = {
    message_id: newMessageId(),
    schema: "orgos.module.message.v1",
    from: { id: opts.from, kind: opts.fromKind ?? "agent" },
    to: { id: opts.to, kind: opts.toKind ?? "agent" },
    intent: opts.intent,
    confidentiality: "L1",
    status: "pending",
    refs: opts.workOrderId ? [{ work_order_id: opts.workOrderId }] : [],
    payload_summary: opts.summary.trim(),
    created_at: new Date().toISOString(),
  };
  const path = appendModuleMessage(message);
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, path, message }, null, 2));
    return;
  }
  console.log(`✓ ${path}`);
}

export function runModuleMessageList(opts: { to: string; json?: boolean }): void {
  const rows = listPendingModuleMessagesFor(opts.to);
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, count: rows.length, messages: rows }, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log(`No pending module messages for ${opts.to}.`);
    return;
  }
  for (const row of rows) {
    console.log(`${row.message_id} · ${row.from.id} → ${row.to.id} · ${row.intent}`);
    console.log(`  ${row.payload_summary}`);
  }
}

export function runModuleMessageImport(opts: { file: string; json?: boolean }): void {
  const raw = readFileSync(opts.file, "utf-8");
  const message = parseModuleMessageYaml(raw);
  const path = appendModuleMessage(message);
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, path, message }, null, 2));
    return;
  }
  console.log(`✓ ${path}`);
}

export function runIntegrationBrief(opts: { agent?: string; json?: boolean }): void {
  const target = opts.agent ?? "integration";
  const messages = listPendingModuleMessagesFor(target);
  const towerLines = buildIntegrationTowerBriefLines();
  const payload = {
    agent: target,
    pending_count: messages.length,
    tower_brief: towerLines,
    messages: messages.map((m) => ({
      message_id: m.message_id,
      from: m.from.id,
      intent: m.intent,
      summary: m.payload_summary,
      work_order_id: m.refs.find((r) => r.work_order_id)?.work_order_id,
    })),
  };
  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`Integration brief · ${target} · ${messages.length} pending message(s)`);
  for (const row of payload.messages) {
    console.log(`- ${row.message_id}: ${row.from} · ${row.intent} — ${row.summary}`);
  }
}
