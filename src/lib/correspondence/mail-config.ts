import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mailConfigSchema, type MailConfig } from "../../../schemas/correspondence/mail-config.js";
import { readYamlFile } from "../utils.js";
import { getMailConfigExamplePath, getMailConfigPath } from "./paths.js";

export function loadMailConfig(): MailConfig | null {
  const path = getMailConfigPath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, mailConfigSchema);
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
#   ORGOS_GMAIL_OAUTH_TOKEN (gmail_api — future)
#
provider: smtp
from:
  name: "株式会社サンプル"
  email: secretary@example.com
smtp:
  host: smtp.gmail.com
  port: 587
  secure: false
inbox:
  sync: stub
  # imap: imap.gmail.com:993
  # gmail_api: label INBOX
notes: |
  Dev: Gmail App Password + SMTP above.
  Prod: Gmail API OAuth or transactional SMTP relay.
`;
  writeFileSync(path, example, "utf-8");
  return path;
}

export function resolveSmtpCredentials(): { user: string; pass: string } | null {
  const user = process.env.ORGOS_SMTP_USER?.trim();
  const pass = process.env.ORGOS_SMTP_PASSWORD?.trim();
  if (!user || !pass) return null;
  return { user, pass };
}

export function resolveSlackWebhookUrl(): string | undefined {
  return process.env.ORGOS_SLACK_WEBHOOK_URL?.trim() || undefined;
}
