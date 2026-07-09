import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import type { MailConfig } from "../../../schemas/correspondence/mail-config.js";
import { getMailSentDir } from "./paths.js";
import { resolveMailConfig, resolveSmtpCredentials } from "./mail-config.js";

export interface SendEmailResult {
  mode: "smtp" | "dry_run";
  messageId?: string;
  artifactPath?: string;
}

function encodeMimeHeaderUtf8(value: string): string {
  return /[^\x00-\x7F]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`
    : value;
}

function buildMimeMessage(
  draft: CorrespondenceDraft,
  config: MailConfig
): string {
  const from = `${encodeMimeHeaderUtf8(config.from.name)} <${config.from.email}>`;
  const to = draft.to ?? "";
  const subject = encodeMimeHeaderUtf8(draft.subject ?? "(no subject)");
  const body = draft.body.trimEnd();
  const cc = draft.cc ? `\r\nCc: ${draft.cc}` : "";
  return [
    `From: ${from}`,
    `To: ${to}${cc}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    "",
  ].join("\r\n");
}

async function readResponse(socket: Socket | TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once("data", (buf) => resolve(buf.toString("utf-8")));
    socket.once("error", reject);
  });
}

async function sendSmtpCommand(
  socket: Socket | TLSSocket,
  command: string
): Promise<string> {
  socket.write(`${command}\r\n`);
  return readResponse(socket);
}

async function sendViaSmtp(
  draft: CorrespondenceDraft,
  config: MailConfig,
  creds: { user: string; pass: string }
): Promise<SendEmailResult> {
  const smtp = config.smtp;
  if (!smtp?.host) {
    throw new Error("SMTP host not configured");
  }

  const message = buildMimeMessage(draft, config);
  const socket: Socket | TLSSocket = smtp.secure
    ? tlsConnect({ host: smtp.host, port: smtp.port, rejectUnauthorized: true })
    : createConnection({ host: smtp.host, port: smtp.port });

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", reject);
  });

  let resp = await readResponse(socket);
  if (!resp.startsWith("220")) throw new Error(`SMTP greeting failed: ${resp.trim()}`);

  resp = await sendSmtpCommand(socket, `EHLO orgos.local`);
  if (!resp.startsWith("250")) throw new Error(`EHLO failed: ${resp.trim()}`);

  if (!smtp.secure && resp.includes("STARTTLS")) {
    resp = await sendSmtpCommand(socket, "STARTTLS");
    if (!resp.startsWith("220")) throw new Error(`STARTTLS failed: ${resp.trim()}`);
    const tlsSocket = tlsConnect({ socket, rejectUnauthorized: true });
    await new Promise<void>((resolve, reject) => {
      tlsSocket.once("secureConnect", () => resolve());
      tlsSocket.once("error", reject);
    });
    resp = await sendSmtpCommand(tlsSocket, "EHLO orgos.local");
    if (!resp.startsWith("250")) throw new Error(`EHLO after STARTTLS failed: ${resp.trim()}`);
    await authenticateAndSend(tlsSocket, creds, config, draft.to!, message);
    tlsSocket.end();
  } else {
    await authenticateAndSend(socket, creds, config, draft.to!, message);
    socket.end();
  }

  return { mode: "smtp", messageId: `${Date.now()}@orgos` };
}

async function authenticateAndSend(
  socket: Socket | TLSSocket,
  creds: { user: string; pass: string },
  config: MailConfig,
  to: string,
  message: string
): Promise<void> {
  let resp = await sendSmtpCommand(socket, "AUTH LOGIN");
  if (!resp.startsWith("334")) throw new Error(`AUTH LOGIN failed: ${resp.trim()}`);

  resp = await sendSmtpCommand(socket, Buffer.from(creds.user).toString("base64"));
  if (!resp.startsWith("334")) throw new Error(`SMTP user rejected: ${resp.trim()}`);

  resp = await sendSmtpCommand(socket, Buffer.from(creds.pass).toString("base64"));
  if (!resp.startsWith("235")) throw new Error(`SMTP auth failed: ${resp.trim()}`);

  resp = await sendSmtpCommand(socket, `MAIL FROM:<${config.from.email}>`);
  if (!resp.startsWith("250")) throw new Error(`MAIL FROM failed: ${resp.trim()}`);

  resp = await sendSmtpCommand(socket, `RCPT TO:<${to}>`);
  if (!resp.startsWith("250")) throw new Error(`RCPT TO failed: ${resp.trim()}`);

  resp = await sendSmtpCommand(socket, "DATA");
  if (!resp.startsWith("354")) throw new Error(`DATA failed: ${resp.trim()}`);

  socket.write(`${message.replace(/\r?\n/g, "\r\n")}\r\n.\r\n`);
  resp = await readResponse(socket);
  if (!resp.startsWith("250")) throw new Error(`Message rejected: ${resp.trim()}`);

  await sendSmtpCommand(socket, "QUIT");
}

function writeDryRunEml(draft: CorrespondenceDraft, config: MailConfig): string {
  const dir = getMailSentDir();
  mkdirSync(dir, { recursive: true });
  const filename = `${draft.draft_id}.eml`;
  const path = join(dir, filename);
  writeFileSync(path, buildMimeMessage(draft, config), "utf-8");
  return path;
}

export async function sendCorrespondenceEmail(
  draft: CorrespondenceDraft,
  opts?: { dryRun?: boolean }
): Promise<SendEmailResult> {
  if (draft.channel !== "email") {
    throw new Error(`Draft ${draft.draft_id} is not an email channel`);
  }
  if (!draft.to) throw new Error("Draft missing to address");

  const config = resolveMailConfig();
  const creds = resolveSmtpCredentials();

  if (opts?.dryRun || config.provider === "dry_run" || !creds) {
    const artifactPath = writeDryRunEml(draft, config);
    return { mode: "dry_run", artifactPath };
  }

  if (config.smtp?.host === "smtp.test.local") {
    const artifactPath = writeDryRunEml(draft, config);
    return { mode: "dry_run", artifactPath };
  }

  if (config.provider === "gmail_api") {
    throw new Error(
      "gmail_api provider not yet implemented — use SMTP + ORGOS_SMTP_* or dry_run"
    );
  }

  return sendViaSmtp(draft, config, creds);
}
