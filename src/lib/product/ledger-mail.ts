import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getWorkspaceRoot } from "../orgos-paths.js";
import { getClock } from "../runtime-context.js";

const outboxSchema = z.object({
  version: z.literal(1),
  messages: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      to: z.string(),
      tenant_id: z.string().optional(),
      subject: z.string(),
      body: z.string(),
      sent_at: z.string(),
      transport: z.enum(["outbox", "smtp"]),
      status: z.enum(["sent", "failed"]).default("sent"),
      error: z.string().optional(),
    }),
  ),
});

export type LedgerMailKind =
  | "signup_received"
  | "provision_complete"
  | "payment_failed"
  | "guest_invite"
  | "mail_drill";

function outboxPath(): string {
  return join(getWorkspaceRoot(), "product-fleet", "mail-outbox.yaml");
}

function loadOutbox() {
  const path = outboxPath();
  if (!existsSync(path)) {
    return outboxSchema.parse({ version: 1, messages: [] });
  }
  return outboxSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

function saveOutbox(file: ReturnType<typeof loadOutbox>): void {
  mkdirSync(join(getWorkspaceRoot(), "product-fleet"), { recursive: true });
  writeFileSync(outboxPath(), YAML.stringify(file), "utf-8");
}

function smtpUrlConfigured(): boolean {
  return Boolean(
    process.env.ORGOS_MAIL_SMTP_URL?.trim() ||
      process.env.ORGOS_LEDGER_SMTP_URL?.trim(),
  );
}

function resolveSmtpUrl(): string | undefined {
  return (
    process.env.ORGOS_MAIL_SMTP_URL?.trim() ||
    process.env.ORGOS_LEDGER_SMTP_URL?.trim() ||
    undefined
  );
}

function buildMessage(input: {
  kind: LedgerMailKind;
  to: string;
  tenantId?: string;
  companyName?: string;
  setupUrl?: string;
}): { subject: string; body: string } {
  switch (input.kind) {
    case "signup_received":
      return {
        subject: "OrgOS Ledger お申し込み受付",
        body: `${input.companyName ?? "御社"} のお申し込みを受け付けました。決済完了後、専用 URL と Passkey 登録手順をお送りします。`,
      };
    case "provision_complete":
      return {
        subject: "OrgOS Ledger テナント準備完了",
        body: [
          `テナント ${input.tenantId} の準備が完了しました。`,
          input.setupUrl
            ? `初回 Passkey 登録（bootstrap）URL: ${input.setupUrl}`
            : "Passkey を登録してログインしてください。",
          "",
          "ログインには Passkey が必須です。帳簿の customer_ready（会社情報＋初回仕訳）とは別ゲートです。",
        ].join("\n"),
      };
    case "payment_failed":
      return {
        subject: "OrgOS Ledger お支払いの確認",
        body: `${input.companyName ?? input.tenantId} のサブスクリプション支払いに問題があります。アカウント画面の請求管理から更新してください。`,
      };
    case "guest_invite":
      return {
        subject: "OrgOS Ledger ゲスト招待",
        body: `ゲストオペレーターとして招待されました。次の URL から Passkey を登録してください: ${input.setupUrl ?? "(ops が案内)"}`,
      };
    case "mail_drill":
      return {
        subject: "OrgOS Ledger mail drill",
        body: `Commercial mail drill at ${getClock().nowIso()}`,
      };
  }
}

function encodeSmtp(line: string): Buffer {
  return Buffer.from(`${line}\r\n`, "utf-8");
}

async function readSmtpResponse(socket: Socket | TLSSocket): Promise<string> {
  return await new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk: Buffer | string) => {
      buf += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      const lines = buf.split(/\r?\n/).filter((line) => line.length > 0);
      const last = lines.at(-1) ?? "";
      if (lines.length > 0 && !/^\d{3}-/.test(last)) {
        socket.off("data", onData);
        socket.off("error", onError);
        resolve(buf);
      }
    };
    const onError = (err: Error) => {
      socket.off("data", onData);
      socket.off("error", onError);
      reject(err);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

async function expectSmtpCode(socket: Socket | TLSSocket, code: number): Promise<void> {
  const raw = await readSmtpResponse(socket);
  if (!raw.startsWith(String(code))) {
    throw new Error(`SMTP expected ${code}, got: ${raw.trim()}`);
  }
}

/**
 * Minimal SMTP client (AUTH LOGIN). Supports smtp:// and smtps://.
 * ORGOS_MAIL_SMTP_MOCK=1 skips network and treats delivery as success (tests).
 */
export async function deliverSmtpMail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  if (process.env.ORGOS_MAIL_SMTP_MOCK === "1") {
    return;
  }
  const rawUrl = resolveSmtpUrl();
  if (!rawUrl) {
    throw new Error("ORGOS_MAIL_SMTP_URL is not configured");
  }
  const url = new URL(rawUrl);
  const secure = url.protocol === "smtps:";
  const host = url.hostname;
  const port = Number(url.port || (secure ? 465 : 587));
  const user = decodeURIComponent(url.username || "");
  const pass = decodeURIComponent(url.password || "");
  const from =
    process.env.ORGOS_MAIL_FROM?.trim() ||
    user ||
    `noreply@${host || "localhost"}`;

  const socket = await new Promise<Socket | TLSSocket>((resolve, reject) => {
    const conn = secure
      ? tlsConnect({ host, port, servername: host }, () => resolve(conn))
      : netConnect({ host, port }, () => resolve(conn));
    conn.on("error", reject);
  });

  try {
    await expectSmtpCode(socket, 220);
    socket.write(encodeSmtp("EHLO orgos-ledger"));
    await expectSmtpCode(socket, 250);
    if (user) {
      socket.write(encodeSmtp("AUTH LOGIN"));
      await expectSmtpCode(socket, 334);
      socket.write(encodeSmtp(Buffer.from(user).toString("base64")));
      await expectSmtpCode(socket, 334);
      socket.write(encodeSmtp(Buffer.from(pass).toString("base64")));
      await expectSmtpCode(socket, 235);
    }
    socket.write(encodeSmtp(`MAIL FROM:<${from}>`));
    await expectSmtpCode(socket, 250);
    socket.write(encodeSmtp(`RCPT TO:<${input.to}>`));
    await expectSmtpCode(socket, 250);
    socket.write(encodeSmtp("DATA"));
    await expectSmtpCode(socket, 354);
    const payload = [
      `From: ${from}`,
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      input.body,
      ".",
    ].join("\r\n");
    socket.write(Buffer.from(`${payload}\r\n`, "utf-8"));
    await expectSmtpCode(socket, 250);
    socket.write(encodeSmtp("QUIT"));
  } finally {
    socket.end();
  }
}

export async function sendLedgerMail(input: {
  kind: LedgerMailKind;
  to: string;
  tenantId?: string;
  companyName?: string;
  setupUrl?: string;
}): Promise<{ transport: "outbox" | "smtp"; id: string; status: "sent" | "failed" }> {
  const { subject, body } = buildMessage(input);
  const id = `MAIL-${Date.now()}`;
  const wantSmtp = smtpUrlConfigured();
  let transport: "outbox" | "smtp" = "outbox";
  let status: "sent" | "failed" = "sent";
  let error: string | undefined;

  if (wantSmtp) {
    try {
      await deliverSmtpMail({ to: input.to.trim(), subject, body });
      transport = "smtp";
      status = "sent";
    } catch (err) {
      transport = "smtp";
      status = "failed";
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const file = loadOutbox();
  file.messages.push({
    id,
    kind: input.kind,
    to: input.to.trim(),
    tenant_id: input.tenantId,
    subject,
    body,
    sent_at: getClock().nowIso(),
    transport,
    status,
    error,
  });
  saveOutbox(file);

  if (status === "failed") {
    throw new Error(error ?? "SMTP delivery failed");
  }
  return { transport, id, status };
}

export function listLedgerMailOutbox() {
  return loadOutbox().messages;
}

/** Commercial gate: recent successful SMTP delivery (drill or real mail). */
export function hasRecentSuccessfulSmtpMail(maxAgeDays = 30): boolean {
  if (!smtpUrlConfigured()) return false;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return loadOutbox().messages.some(
    (row) =>
      row.transport === "smtp" &&
      (row.status ?? "sent") === "sent" &&
      Date.parse(row.sent_at) >= cutoff,
  );
}

export async function runLedgerMailDrill(to: string): Promise<{
  transport: "outbox" | "smtp";
  id: string;
  status: "sent" | "failed";
}> {
  return sendLedgerMail({ kind: "mail_drill", to });
}
