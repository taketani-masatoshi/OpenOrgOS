import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mailConfigSchema, type MailConfig } from "../../../schemas/correspondence/mail-config.js";
import { parseMailConfigFile } from "./mail-config-parse.js";
import { hydrateMailEnvFromStore } from "./mail-secrets-store.js";
import { getMailConfigExamplePath, getMailConfigPath } from "./paths.js";

export function loadMailConfig(): MailConfig | null {
  const path = getMailConfigPath();
  if (!existsSync(path)) return null;
  return parseMailConfigFile(readFileSync(path, "utf-8"));
}

/** Test / CI SMTP host — writes EML only; no live delivery or credentials. */
export function isDryRunSmtpHost(host?: string): boolean {
  return host === "smtp.test.local";
}

export function resolveMailConfig(): MailConfig {
  const config = loadMailConfig();
  if (config) return config;
  return mailConfigSchema.parse({
    provider: process.env.ORGOS_SMTP_HOST ? "smtp" : "dry_run",
    from: {
      name: process.env.ORGOS_MAIL_FROM_NAME ?? "OrgOS Secretary",
      email: process.env.ORGOS_MAIL_FROM ?? "secretary@example.com",
    },
    smtp: process.env.ORGOS_SMTP_HOST
      ? {
          host: process.env.ORGOS_SMTP_HOST,
          port: Number(process.env.ORGOS_SMTP_PORT ?? 587),
          secure: process.env.ORGOS_SMTP_SECURE === "true",
        }
      : undefined,
  });
}

export function ensureMailConfigExample(): string {
  const path = getMailConfigExamplePath();
  if (existsSync(path)) return path;
  mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  const example = `# Executive mail config (L2 — copy to mail-config.yaml)
# Path: records/executive/mail-config.yaml
#
# Secrets via environment (never commit):
#   ORGOS_SMTP_USER · ORGOS_SMTP_PASSWORD
#   ORGOS_MAIL_FROM · ORGOS_MAIL_FROM_NAME
#   ORGOS_GMAIL_CLIENT_ID · ORGOS_GMAIL_CLIENT_SECRET (gmail_api)
#   orgos mail setup gmail → records/executive/gmail-oauth.json (+ client.json)
#
provider: smtp
from:
  name: "株式会社サンプル"
  email: secretary@example.com
smtp:
  host: smtp.gmail.com
  port: 587
  secure: false
outbound:
  cc_defaults:
    - email: ceo@example.com
      role: ceo
receive:
  sync: stub
  # imap_host: imap.example.com
  # imap_port: 993
  # imap_mailbox: INBOX
  # poll_interval_sec: 300
  # triage_mode: rules
  # auto_triage: true
  # notify_high_priority: true
  # notify_ceo_desktop: true   # 高優先 triage 時の macOS 即時通知
  # ceo_question_mode: inline
  # interpret_ensemble: true
  # interpret_models: []
  # scheduling_reminder_after_hours: 72
  # gmail_label: INBOX
notes: |
  receive = Secretary メール受信同期（IMAP 将来）
  ≠ docs/io/inbox（書類）· ≠ docs/protocol/inbox（Wire）
`;
  writeFileSync(path, example, "utf-8");
  return path;
}

export function resolveSmtpCredentials(): { user: string; pass: string } | null {
  hydrateMailEnvFromStore();
  const user = process.env.ORGOS_SMTP_USER?.trim();
  const pass = process.env.ORGOS_SMTP_PASSWORD?.trim();
  if (!user || !pass) return null;
  return { user, pass };
}

export function resolveWireSmtpCredentials(): { user: string; pass: string } | null {
  const wireUser = process.env.ORGOS_WIRE_SMTP_USER?.trim();
  const wirePass = process.env.ORGOS_WIRE_SMTP_PASSWORD?.trim();
  if (wireUser && wirePass) return { user: wireUser, pass: wirePass };
  return resolveSmtpCredentials();
}

export interface WireOutboundConfig {
  enabled: boolean;
  provider: "smtp" | "dry_run";
  from: { name: string; email: string };
  smtp?: { host: string; port: number; secure: boolean };
}

export function resolveWireOutboundConfig(): WireOutboundConfig {
  const base = resolveMailConfig();
  const wire = base.wire_outbound;
  const enabled = wire?.enabled === true;
  const from = wire?.from ?? {
    name: process.env.ORGOS_WIRE_MAIL_FROM_NAME ?? "OrgOS Wire",
    email: process.env.ORGOS_WIRE_MAIL_FROM ?? "wire-notices@example.com",
  };

  const smtpHost =
    wire?.smtp?.host ??
    process.env.ORGOS_WIRE_SMTP_HOST ??
    process.env.ORGOS_SMTP_HOST;
  const smtpPort = Number(
    wire?.smtp?.port ?? process.env.ORGOS_WIRE_SMTP_PORT ?? process.env.ORGOS_SMTP_PORT ?? 587
  );
  const smtpSecure =
    wire?.smtp?.secure ??
    (process.env.ORGOS_WIRE_SMTP_SECURE === "true" ||
      process.env.ORGOS_SMTP_SECURE === "true");

  const smtpConfig = smtpHost
    ? { host: smtpHost, port: smtpPort, secure: smtpSecure }
    : undefined;

  if (base.provider === "dry_run" || isDryRunSmtpHost(wire?.smtp?.host)) {
    return {
      enabled,
      provider: "dry_run",
      from,
      smtp: smtpConfig,
    };
  }

  const provider =
    enabled && smtpHost && resolveWireSmtpCredentials() ? "smtp" : "dry_run";

  return {
    enabled,
    provider,
    from,
    smtp: smtpConfig,
  };
}

export function resolveSlackWebhookUrl(): string | undefined {
  return process.env.ORGOS_SLACK_WEBHOOK_URL?.trim() || undefined;
}

/** R5 Phase 2 — auto wire scan after mail sync/triage when enabled */
export function shouldAutoWireScan(config: MailConfig | null): boolean {
  if (!config) return false;
  if (config.receive?.auto_wire_scan === false) return false;
  if ((config.receive?.sync ?? "stub") === "stub") return false;
  return true;
}

/** email_notify Pull scan after mail sync when enabled (default on when IMAP/API sync active). */
export function shouldAutoNotifyScan(config: MailConfig | null): boolean {
  if (!config) return false;
  if (config.receive?.auto_notify_scan === false) return false;
  if ((config.receive?.sync ?? "stub") === "stub") return false;
  return true;
}
