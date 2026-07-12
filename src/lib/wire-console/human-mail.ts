import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import type { OrgRef } from "../../../schemas/protocol/org-event.js";
import { loadCompany, loadContract } from "../data.js";
import { exportInboxEntries, exportOutboxEntries } from "../protocol/inbox-export.js";
import { findPeerByOrgRef } from "../protocol/inbound-verify.js";
import { loadPeersRegistry } from "../protocol/peers.js";
import { listWitnessPending } from "../protocol/witness-queue.js";
import { verifyCachedReceiptsForEvent } from "../protocol/witness-client.js";
import { listOrgApprovals } from "../org/approval/reject.js";
import { getTenantId } from "../tenant.js";
import { withWireConsoleTenant } from "./tenant-context.js";
import { getTenantEventDetail, getTenantEventWorkflow } from "./tenant-data.js";
import { sanitizeForWireConsoleOutput } from "../sanitize-output.js";

function redactMailText(text: string): string {
  return sanitizeForWireConsoleOutput(JSON.stringify(text)).slice(1, -1);
}

function redactMessageSummary(m: HumanMessageSummary): HumanMessageSummary {
  return {
    ...m,
    subject: redactMailText(m.subject),
    preview: redactMailText(m.preview),
    counterparty: redactMailText(m.counterparty),
    status_label: redactMailText(m.status_label),
  };
}

function redactMessageBody(m: HumanMessageBody): HumanMessageBody {
  return {
    ...m,
    subject: redactMailText(m.subject),
    from_label: redactMailText(m.from_label),
    to_label: redactMailText(m.to_label),
    body_text: redactMailText(m.body_text),
    status_label: redactMailText(m.status_label),
    workflow_summary: m.workflow_summary.map(redactMailText),
  };
}

export type MailFolder = "inbox" | "outbox" | "pending" | "witness" | "all";

export interface HumanMessageSummary {
  id: string;
  kind: "envelope" | "approval" | "witness";
  folder: MailFolder;
  thread_id: string;
  subject: string;
  preview: string;
  counterparty: string;
  counterparty_id?: string;
  recorded_at: string;
  status_label: string;
  status_tone: "neutral" | "pending" | "success" | "warning" | "error";
  event_id?: string;
  approval_id?: string;
  contract_id?: string;
  transaction_id?: string;
  wire_event_id?: string;
  can_approve?: boolean;
  can_send?: boolean;
  can_witness?: boolean;
}

export interface MailThreadSummary {
  thread_id: string;
  title: string;
  counterparty: string;
  message_count: number;
  last_at: string;
  status_label: string;
  status_tone: HumanMessageSummary["status_tone"];
  contract_id?: string;
  transaction_id?: string;
  messages: HumanMessageSummary[];
}

export interface HumanMessageBody {
  id: string;
  subject: string;
  from_label: string;
  to_label: string;
  recorded_at: string;
  body_text: string;
  status_label: string;
  status_tone: HumanMessageSummary["status_tone"];
  workflow_summary: string[];
  event_id?: string;
  approval_id?: string;
  wire_event_id?: string;
  peer_id?: string;
  contract_id?: string;
  can_approve?: boolean;
  can_send?: boolean;
  can_witness?: boolean;
}

const TX_LABELS: Record<string, string> = {
  "contract.execution.notice": "履行通知",
  "obligation.acknowledged": "義務の受理",
  "invoice.issued": "請求書の発行",
  "payment.instructed": "支払いの指示",
  "contract.executed": "契約の締結",
};

const ORG_DISPLAY_FALLBACK: Record<string, string> = {
  mal: "株式会社MAL",
  southwood: "株式会社サウスウッド",
  aiac: "AIAC",
};

const HUB_DISPLAY: Record<string, string> = {
  "HUB-A": "公証機関 A",
  "HUB-B": "公証機関 B",
};

function hubDisplayName(hubId: string): string {
  return HUB_DISPLAY[hubId] ?? hubId;
}

function humanizeBodyText(text: string, contractId?: string): string {
  if (contractId) {
    const stripped = text.replace(new RegExp(`^${contractId}\\s*`), "").trim();
    if (stripped.length > 0) return stripped;
  }
  return text;
}

function contractShortTitle(contractId: string | undefined): string | undefined {
  if (!contractId) return undefined;
  try {
    const contract = loadContract(contractId);
    if (!contract) return undefined;
    let title = contract.name.split("·")[0]?.trim() ?? contract.name;
    const open = (title.match(/（/g) ?? []).length;
    const close = (title.match(/）/g) ?? []).length;
    if (open > close) title += "）";
    return title.length > 40 ? `${title.slice(0, 37)}…` : title;
  } catch {
    return undefined;
  }
}

function orgDisplayName(
  orgRef: OrgRef,
  _peers: ReturnType<typeof loadPeersRegistry>["peers"]
): string {
  const peer = findPeerByOrgRef(orgRef);
  if (peer?.display_name) return peer.display_name;
  const tenantId = getTenantId();
  if (orgRef.org_id === tenantId || orgRef.org_uri?.includes(`/${tenantId}`)) {
    try {
      return loadCompany().name;
    } catch {
      /* optional */
    }
  }
  return ORG_DISPLAY_FALLBACK[orgRef.org_id] ?? orgRef.org_id;
}

function isBusinessMailEnvelope(envelope: { event: { type: string; payload: unknown } }): boolean {
  const type = envelope.event.type;
  if (type.startsWith("org.witness.")) return false;
  const payload = envelope.event.payload as Record<string, unknown>;
  const txType = payload.transaction_type;
  if (typeof txType === "string" && txType.includes("witness")) return false;
  if (type.startsWith("org.identity.") || type.startsWith("org.delegation.")) return false;
  return true;
}

function peerDisplayName(
  peerId: string | undefined,
  peers: ReturnType<typeof loadPeersRegistry>["peers"]
) {
  if (!peerId) return "—";
  const peer = peers.find((p) => p.peer_id === peerId);
  return peer?.display_name ?? peerId;
}

function payloadFields(payload: Record<string, unknown>) {
  const refs = payload.refs as Record<string, unknown> | undefined;
  return {
    transaction_type:
      typeof payload.transaction_type === "string" ? payload.transaction_type : undefined,
    direction: typeof payload.direction === "string" ? payload.direction : undefined,
    transaction_id: typeof payload.transaction_id === "string" ? payload.transaction_id : undefined,
    contract_id:
      typeof payload.contract_id === "string"
        ? payload.contract_id
        : refs && typeof refs.contract_id === "string"
          ? refs.contract_id
          : undefined,
    message:
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.notes === "string"
          ? payload.notes
          : undefined,
    correlation_event_id:
      typeof payload.correlation_event_id === "string" ? payload.correlation_event_id : undefined,
    notice_id: typeof payload.notice_id === "string" ? payload.notice_id : undefined,
  };
}

function buildSubject(fields: ReturnType<typeof payloadFields>, eventType: string): string {
  const rawType =
    fields.transaction_type ?? eventType.replace(/^org\./, "").replace(/^steward\./, "");
  const txLabel = fields.transaction_type
    ? (TX_LABELS[fields.transaction_type.replace(/^steward\./, "")] ?? rawType.replace(/\./g, " "))
    : eventType.replace(/^org\./, "").replace(/\./g, " ");
  const contractTitle = contractShortTitle(fields.contract_id);
  if (contractTitle) return `${txLabel} — ${contractTitle}`;
  if (fields.contract_id) return `${txLabel} — ${fields.contract_id}`;
  return txLabel;
}

function threadIdFor(fields: {
  transaction_id?: string;
  contract_id?: string;
  correlation_event_id?: string;
  event_id: string;
}): string {
  return (
    fields.transaction_id ?? fields.contract_id ?? fields.correlation_event_id ?? fields.event_id
  );
}

function envelopeStatus(
  tenantId: string,
  eventId: string,
  location: "inbox" | "outbox"
): { label: string; tone: HumanMessageSummary["status_tone"]; can_send: boolean } {
  if (location === "inbox") {
    return { label: "受信済み", tone: "success", can_send: false };
  }
  const workflow = getTenantEventWorkflow(tenantId, eventId);
  if (workflow.quorum_satisfied) {
    return { label: "完了", tone: "success", can_send: false };
  }
  if (workflow.wire_delivered && !workflow.quorum_satisfied) {
    return { label: "証人確認中", tone: "warning", can_send: false };
  }
  if (workflow.wire_pending) {
    return { label: "送信待ち", tone: "pending", can_send: true };
  }
  if (workflow.wire_delivered) {
    return { label: "相手に送信済み", tone: "success", can_send: false };
  }
  return { label: "送信前", tone: "neutral", can_send: true };
}

function approvalStatus(approval: OrgApprovalRequest): {
  label: string;
  tone: HumanMessageSummary["status_tone"];
  can_approve: boolean;
} {
  if (approval.status === "pending_approval") {
    return { label: "承認待ち", tone: "pending", can_approve: true };
  }
  if (approval.status === "rejected") {
    return { label: "差し戻し", tone: "error", can_approve: false };
  }
  if (approval.status === "completed") {
    return { label: "送信済み", tone: "success", can_approve: false };
  }
  return { label: approval.status, tone: "neutral", can_approve: false };
}

function buildEnvelopeMessage(
  tenantId: string,
  entry: ReturnType<typeof exportOutboxEntries>[number],
  location: "inbox" | "outbox",
  peers: ReturnType<typeof loadPeersRegistry>["peers"]
): HumanMessageSummary {
  const payload = entry.envelope.event.payload as Record<string, unknown>;
  const fields = payloadFields(payload);
  const approval = listOrgApprovals({ scope: "wire" }).find(
    (a) => a.wire?.wire_event_id === entry.event_id
  );
  const peerId = approval?.wire?.peer_id;
  const counterparty =
    location === "inbox"
      ? orgDisplayName(entry.envelope.origin, peers)
      : peerDisplayName(peerId, peers) ||
        (entry.envelope.destination
          ? orgDisplayName(entry.envelope.destination, peers)
          : orgDisplayName(entry.envelope.origin, peers));
  const status = envelopeStatus(tenantId, entry.event_id, location);
  const preview =
    fields.message ??
    (contractShortTitle(fields.contract_id)
      ? `${contractShortTitle(fields.contract_id)}に関する${buildSubject(fields, entry.envelope.event.type).split("（")[0]}です。`
      : "（本文なし）");
  const previewText =
    fields.message != null ? humanizeBodyText(fields.message, fields.contract_id) : preview;

  return {
    id: entry.event_id,
    kind: "envelope",
    folder: location,
    thread_id: threadIdFor({ ...fields, event_id: entry.event_id }),
    subject: buildSubject(fields, entry.envelope.event.type),
    preview: previewText.length > 120 ? `${previewText.slice(0, 117)}…` : previewText,
    counterparty,
    counterparty_id: peerId ?? entry.envelope.origin.org_id,
    recorded_at: entry.recorded_at,
    status_label: status.label,
    status_tone: status.tone,
    event_id: entry.event_id,
    approval_id: approval?.approval_id,
    contract_id: fields.contract_id,
    transaction_id: fields.transaction_id,
    wire_event_id: entry.event_id,
    can_send: status.can_send,
  };
}

function buildApprovalMessage(
  approval: OrgApprovalRequest,
  peers: ReturnType<typeof loadPeersRegistry>["peers"]
): HumanMessageSummary {
  const peerId = approval.wire?.peer_id;
  const contractId = approval.wire?.contract_id ?? approval.subject_ref;
  const txType = approval.wire?.transaction_type;
  const txLabel = txType ? (TX_LABELS[txType] ?? txType) : "通知";
  const subject = contractId
    ? `${txLabel} — ${contractId}`
    : txType
      ? `${txLabel}`
      : (approval.subject_ref ?? "承認依頼");
  const status = approvalStatus(approval);
  const preview =
    approval.message ?? `${peerDisplayName(peerId, peers)} 宛ての通知を送信する承認依頼です。`;

  return {
    id: `approval:${approval.approval_id}`,
    kind: "approval",
    folder: "pending",
    thread_id: approval.wire?.transaction_id ?? contractId ?? approval.approval_id,
    subject,
    preview: preview.length > 120 ? `${preview.slice(0, 117)}…` : preview,
    counterparty: peerDisplayName(peerId, peers),
    counterparty_id: peerId,
    recorded_at: approval.proposed_at,
    status_label: status.label,
    status_tone: status.tone,
    approval_id: approval.approval_id,
    contract_id: contractId,
    transaction_id: approval.wire?.transaction_id,
    wire_event_id: approval.wire?.wire_event_id,
    can_approve: status.can_approve,
  };
}

function buildWitnessPendingMessage(
  entry: ReturnType<typeof listWitnessPending>[number]
): HumanMessageSummary {
  const sideJa = entry.side === "sent" ? "送信側" : "受信側";
  const hub = hubDisplayName(entry.hub_id);
  return {
    id: `witness:${entry.hub_id}:${entry.event_id}:${entry.side}`,
    kind: "witness",
    folder: "witness",
    thread_id: entry.event_id,
    subject: `確認待ち — 履行通知（MAL → サウスウッド）`,
    preview: `${sideJa}の記録を${hub}へ登録してください。当事者ではない第三者として確認します。`,
    counterparty: "株式会社MAL ↔ 株式会社サウスウッド",
    recorded_at: entry.created_at,
    status_label: "確認待ち",
    status_tone: "pending",
    event_id: entry.event_id,
    wire_event_id: entry.event_id,
    can_witness: true,
  };
}

export function getTenantMailMessages(
  tenantId: string,
  folder: MailFolder = "all"
): HumanMessageSummary[] {
  return withWireConsoleTenant(tenantId, () => {
    const peers = loadPeersRegistry().peers;
    const messages: HumanMessageSummary[] = [];

    if (folder === "inbox" || folder === "all") {
      for (const entry of exportInboxEntries({ limit: 100 })) {
        if (!isBusinessMailEnvelope(entry.envelope)) continue;
        messages.push(buildEnvelopeMessage(tenantId, entry, "inbox", peers));
      }
    }
    if (folder === "outbox" || folder === "all") {
      for (const entry of exportOutboxEntries({ limit: 100 })) {
        if (!isBusinessMailEnvelope(entry.envelope)) continue;
        messages.push(buildEnvelopeMessage(tenantId, entry, "outbox", peers));
      }
    }
    if (folder === "pending" || folder === "all") {
      for (const approval of listOrgApprovals({ scope: "wire" })) {
        if (approval.status !== "pending_approval") continue;
        messages.push(buildApprovalMessage(approval, peers));
      }
    }
    if (folder === "witness" || folder === "all") {
      for (const entry of listWitnessPending()) {
        messages.push(buildWitnessPendingMessage(entry));
      }
    }

    return messages
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
      .map(redactMessageSummary);
  });
}

export function getTenantMailThreads(
  tenantId: string,
  folder: MailFolder = "all"
): MailThreadSummary[] {
  const messages = getTenantMailMessages(tenantId, folder === "pending" ? "pending" : "all");
  const filtered =
    folder === "inbox"
      ? messages.filter((m) => m.folder === "inbox")
      : folder === "outbox"
        ? messages.filter((m) => m.folder === "outbox")
        : folder === "pending"
          ? messages.filter((m) => m.folder === "pending")
          : folder === "witness"
            ? messages.filter((m) => m.folder === "witness")
            : messages;

  const byThread = new Map<string, HumanMessageSummary[]>();
  for (const msg of filtered) {
    const list = byThread.get(msg.thread_id) ?? [];
    list.push(msg);
    byThread.set(msg.thread_id, list);
  }

  const threads: MailThreadSummary[] = [];
  for (const [threadId, msgs] of byThread) {
    const sorted = [...msgs].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
    const latest = sorted[sorted.length - 1]!;
    const contractId = latest.contract_id;
    const contractTitle = contractShortTitle(contractId);
    const title = contractTitle ?? (contractId ? latest.subject : latest.subject);
    threads.push({
      thread_id: threadId,
      title,
      counterparty: latest.counterparty,
      message_count: sorted.length,
      last_at: latest.recorded_at,
      status_label: latest.status_label,
      status_tone: latest.status_tone,
      contract_id: contractId,
      transaction_id: latest.transaction_id,
      messages: sorted,
    });
  }

  return threads
    .sort((a, b) => b.last_at.localeCompare(a.last_at))
    .map((t) => ({
      ...t,
      title: redactMailText(t.title),
      counterparty: redactMailText(t.counterparty),
      status_label: redactMailText(t.status_label),
      messages: t.messages.map(redactMessageSummary),
    }));
}

export function getTenantMailMessageBody(
  tenantId: string,
  messageId: string
): HumanMessageBody | undefined {
  return withWireConsoleTenant(tenantId, () => {
    const peers = loadPeersRegistry().peers;

    if (messageId.startsWith("witness:")) {
      const parts = messageId.split(":");
      const hubId = parts[1];
      const eventId = parts[2];
      const side = parts[3] as "sent" | "received";
      const pending = listWitnessPending().find(
        (p) => p.hub_id === hubId && p.event_id === eventId && p.side === side
      );
      if (!pending) return undefined;
      const summary = buildWitnessPendingMessage(pending);
      return redactMessageBody({
        id: messageId,
        subject: summary.subject,
        from_label: "株式会社MAL",
        to_label: "株式会社サウスウッド",
        recorded_at: summary.recorded_at,
        body_text: `株式会社MAL と 株式会社サウスウッド の間で、オフィス賃貸借（CTR-012）に関する履行通知が交わされました。\n\n本組織は当事者ではありません。${hubDisplayName(pending.hub_id)} への${pending.side === "sent" ? "送信" : "受信"}側の記録登録が未了です。\n\n${summary.preview}`,
        status_label: summary.status_label,
        status_tone: summary.status_tone,
        workflow_summary: [
          "① MAL が送信",
          "② サウスウッドが受信",
          "③ 本組織が第三者として公証に登録",
        ],
        event_id: eventId,
        wire_event_id: eventId,
        can_approve: false,
        can_send: false,
        can_witness: true,
      });
    }

    if (messageId.startsWith("approval:")) {
      const approvalId = messageId.slice("approval:".length);
      const approval = listOrgApprovals({ scope: "wire" }).find(
        (a) => a.approval_id === approvalId
      );
      if (!approval) return undefined;
      const summary = buildApprovalMessage(approval, peers);
      return redactMessageBody({
        id: summary.id,
        subject: summary.subject,
        from_label: approval.proposed_by,
        to_label: summary.counterparty,
        recorded_at: summary.recorded_at,
        body_text: approval.message ?? summary.preview,
        status_label: summary.status_label,
        status_tone: summary.status_tone,
        workflow_summary: ["① 承認待ち — 送信申請"],
        approval_id: approval.approval_id,
        peer_id: approval.wire?.peer_id,
        contract_id: summary.contract_id,
        wire_event_id: approval.wire?.wire_event_id,
        can_approve: summary.can_approve,
        can_send: false,
        can_witness: false,
      });
    }

    const detail = getTenantEventDetail(tenantId, messageId);
    if (!detail) return undefined;

    const payload = detail.envelope.event.payload as Record<string, unknown>;
    const fields = payloadFields(payload);
    const workflow = getTenantEventWorkflow(tenantId, messageId);
    const summary = buildEnvelopeMessage(
      tenantId,
      {
        event_id: messageId,
        envelope_digest: detail.envelope_digest,
        recorded_at: detail.recorded_at,
        envelope: detail.envelope,
      },
      detail.location,
      peers
    );

    const workflowSummary = workflow.steps
      .filter((s) => s.status !== "n/a")
      .map((s) => {
        const labels: Record<string, string> = {
          approval: "社内承認",
          outbox: "記録",
          delivery: "相手への配送",
          witness: "第三者による公証",
        };
        const statusJa: Record<string, string> = {
          done: "完了",
          pending: "未了",
          queued: "待機中",
          partial: "一部完了",
          rejected: "差し戻し",
        };
        return `${labels[s.id] ?? s.label}：${statusJa[s.status] ?? s.status}`;
      });

    const bodyText = fields.message
      ? humanizeBodyText(fields.message, fields.contract_id)
      : summary.preview;

    let canWitness: boolean;
    try {
      const v = verifyCachedReceiptsForEvent(messageId);
      canWitness = detail.location === "outbox" && !v.quorum.satisfied;
    } catch {
      canWitness = detail.location === "outbox";
    }

    return redactMessageBody({
      id: messageId,
      subject: summary.subject,
      from_label: orgDisplayName(detail.envelope.origin, peers),
      to_label: summary.counterparty,
      recorded_at: detail.recorded_at,
      body_text: bodyText,
      status_label: summary.status_label,
      status_tone: summary.status_tone,
      workflow_summary: workflowSummary,
      event_id: messageId,
      approval_id: workflow.approval_id,
      wire_event_id: messageId,
      peer_id: workflow.peer_id,
      contract_id: fields.contract_id,
      can_approve: false,
      can_send: summary.can_send,
      can_witness: canWitness,
    });
  });
}
