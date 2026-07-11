import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { PeerProfile } from "../../../schemas/protocol/peers.js";
import { parseEmailWireRecipient } from "../../../schemas/protocol/peer-endpoint.js";
import { envelopeToWireMessage } from "../wire-gateway/codec.js";
import { resolveWireOutboundConfig, resolveWireSmtpCredentials, loadMailConfig } from "../correspondence/mail-config.js";
import { getWireSentDir } from "../correspondence/paths.js";
import { loadTenantConfig, getTenantId } from "../tenant.js";
import { resolveWireNodeDid } from "../../../schemas/protocol/openorg-did.js";
import { exportProtocolPublicKeyBase64 } from "./signing.js";
import { isTenantWireNodeRegistryApproved } from "./wire-node-governance.js";
import { sendRawMimeEmail } from "../correspondence/mail-send.js";
import { isEmailWireRateLimited } from "./delivery-ledger.js";

export const EMAIL_WIRE_MAX_BYTES = 1_048_576;
/** Per-part payload budget (MIME overhead reserved) */
export const EMAIL_WIRE_PART_PAYLOAD_BYTES = 900_000;

const WIRE_PLAIN_BODY =
  "Signed Wire notice. Do not reply. Process via OrgOS mail intake wire scan (Phase 2).";

export interface EmailWireDeliverResult {
  ok: boolean;
  reason: string;
  smtpMessageId?: string;
  artifactPath?: string;
  mode?: "smtp" | "dry_run";
  parts_sent?: number;
}

function encodeMimeHeaderUtf8(value: string): string {
  return /[^\x00-\x7F]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`
    : value;
}

function resolveSenderDid(): string {
  const tenant = getTenantId();
  const publicKey = exportProtocolPublicKeyBase64();
  if (publicKey) {
    return resolveWireNodeDid({
      publicKeyBase64: publicKey,
      tenantId: tenant,
      requirePk: true,
    });
  }
  return `did:ooo:org:${tenant}`;
}

export function resolvePeerWireEmail(peer: PeerProfile, endpointUrl: string): string | undefined {
  if (peer.wire_email) return peer.wire_email;
  return parseEmailWireRecipient(endpointUrl);
}

export function splitWireJsonPayload(wireJson: string): string[] {
  if (Buffer.byteLength(wireJson, "utf-8") <= EMAIL_WIRE_PART_PAYLOAD_BYTES) {
    return [wireJson];
  }
  const parts: string[] = [];
  let offset = 0;
  while (offset < wireJson.length) {
    let chunkEnd = Math.min(offset + EMAIL_WIRE_PART_PAYLOAD_BYTES, wireJson.length);
    while (
      chunkEnd > offset &&
      Buffer.byteLength(wireJson.slice(offset, chunkEnd), "utf-8") > EMAIL_WIRE_PART_PAYLOAD_BYTES
    ) {
      chunkEnd -= 1;
    }
    parts.push(wireJson.slice(offset, chunkEnd));
    offset = chunkEnd;
  }
  return parts;
}

export function buildWireMimeMessage(
  envelope: EventEnvelope,
  opts: {
    to: string;
    fromName: string;
    fromEmail: string;
    wireJson?: string;
    partIndex?: number;
    partTotal?: number;
  }
): string {
  if (!envelope.signature) {
    throw new Error("envelope must be signed for email_wire");
  }
  const wire = envelopeToWireMessage(envelope);
  const wireJson = opts.wireJson ?? JSON.stringify(wire);
  const boundary = `openorgos-${envelope.event_id.slice(0, 8)}`;
  const subjectTag = envelope.event_id.slice(0, 8);
  const from = `${encodeMimeHeaderUtf8(opts.fromName)} <${opts.fromEmail}>`;
  const senderDid = resolveSenderDid();
  const partHeader =
    opts.partIndex != null && opts.partTotal != null
      ? `X-OpenOrgOS-Wire-Part: ${opts.partIndex}/${opts.partTotal}`
      : undefined;

  const headers = [
    `From: ${from}`,
    `To: ${opts.to}`,
    `Subject: [OpenOrgOS] ${subjectTag}`,
    "MIME-Version: 1.0",
    "X-OpenOrgOS-Wire-Version: 0.1",
    `X-OpenOrgOS-Event-Id: ${envelope.event_id}`,
    `X-OpenOrgOS-Sender-Did: ${senderDid}`,
    "X-OpenOrgOS-Transport: email_wire",
    partHeader,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter((line): line is string => Boolean(line));

  return [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    WIRE_PLAIN_BODY,
    "",
    `--${boundary}`,
    'Content-Type: application/vnd.openorgos.wire+json; charset="UTF-8"',
    'Content-Disposition: attachment; filename="wire-message.json"',
    "Content-Transfer-Encoding: 8bit",
    "",
    wireJson,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export function assertEmailWireAllowed(opts: {
  to: string;
  fromEmail: string;
  messageBytes: number;
}): void {
  if (opts.to.trim().toLowerCase() === opts.fromEmail.trim().toLowerCase()) {
    throw new Error("E12: refuse self-delivery to own wire_email");
  }
  if (opts.messageBytes > EMAIL_WIRE_MAX_BYTES) {
    throw new Error(`E11: email_wire message exceeds ${EMAIL_WIRE_MAX_BYTES} bytes`);
  }
  if (process.env.ORGOS_STRICT_TRUST === "1") {
    const tenant = loadTenantConfig().id;
    if (!isTenantWireNodeRegistryApproved(tenant)) {
      throw new Error("E13: email_wire disabled until trust-registry governance approved");
    }
  }
}

export async function deliverEnvelopeViaEmailWire(
  envelope: EventEnvelope,
  peer: PeerProfile,
  endpointUrl: string
): Promise<EmailWireDeliverResult> {
  const to = resolvePeerWireEmail(peer, endpointUrl);
  if (!to) {
    return { ok: false, reason: "E4: peer wire_email not configured" };
  }

  const config = resolveWireOutboundConfig();
  if (!config.enabled) {
    return { ok: false, reason: "wire_outbound disabled in mail-config" };
  }

  const maxPerHour = loadMailConfig()?.wire_outbound?.max_per_hour ?? 0;
  if (isEmailWireRateLimited(maxPerHour)) {
    return { ok: false, reason: "E14: email_wire max_per_hour exceeded" };
  }

  const wire = envelopeToWireMessage(envelope);
  const wireJson = JSON.stringify(wire);
  const parts = splitWireJsonPayload(wireJson);

  const creds = resolveWireSmtpCredentials();
  const dryRun =
    config.provider === "dry_run" ||
    !creds ||
    config.smtp?.host === "smtp.test.local";

  const artifactDir = getWireSentDir();
  mkdirSync(artifactDir, { recursive: true });

  const mimeMessages = parts.map((partJson, idx) =>
    buildWireMimeMessage(envelope, {
      to,
      fromName: config.from.name,
      fromEmail: config.from.email,
      wireJson: partJson,
      partIndex: parts.length > 1 ? idx + 1 : undefined,
      partTotal: parts.length > 1 ? parts.length : undefined,
    })
  );

  for (const mime of mimeMessages) {
    try {
      assertEmailWireAllowed({
        to,
        fromEmail: config.from.email,
        messageBytes: Buffer.byteLength(mime, "utf-8"),
      });
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  const artifactPath = join(artifactDir, `${envelope.event_id}.eml`);
  writeFileSync(artifactPath, mimeMessages.join("\n---PART---\n"), "utf-8");

  if (dryRun) {
    return {
      ok: true,
      reason: "dry_run",
      mode: "dry_run",
      artifactPath,
      smtpMessageId: `${envelope.event_id}@orgos-wire`,
      parts_sent: mimeMessages.length,
    };
  }

  try {
    let lastMessageId: string | undefined;
    for (const mime of mimeMessages) {
      const sent = await sendRawMimeEmail({
        mime,
        fromEmail: config.from.email,
        recipients: [to],
        smtp: config.smtp!,
        creds,
      });
      lastMessageId = sent.messageId;
    }
    return {
      ok: true,
      reason: "smtp-accepted",
      mode: "smtp",
      artifactPath,
      smtpMessageId: lastMessageId,
      parts_sent: mimeMessages.length,
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : String(e),
      artifactPath,
    };
  }
}
