import { existsSync, readFileSync } from "node:fs";
import { resolveSmtpCredentials } from "./mail-config.js";
import {
  hydrateMailEnvFromStore,
  loadMailSecretsFromFile,
} from "./mail-secrets-store.js";
import { getImapEnvPath } from "./paths.js";

export interface ImapCredentials {
  user: string;
  pass: string;
  host?: string;
  port?: number;
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function resolveImapCredentials(): ImapCredentials | null {
  hydrateMailEnvFromStore();
  const fileEnv = {
    ...parseEnvFile(getImapEnvPath()),
    ...loadMailSecretsFromFile(),
  };
  const smtp = resolveSmtpCredentials();

  const user =
    process.env.ORGOS_IMAP_USER?.trim() ||
    fileEnv.ORGOS_IMAP_USER?.trim() ||
    process.env.ORGOS_SMTP_USER?.trim() ||
    smtp?.user;
  const pass =
    process.env.ORGOS_IMAP_PASSWORD?.trim() ||
    fileEnv.ORGOS_IMAP_PASSWORD?.trim() ||
    process.env.ORGOS_SMTP_PASSWORD?.trim() ||
    smtp?.pass;

  if (!user || !pass) return null;

  const host = process.env.ORGOS_IMAP_HOST?.trim() || fileEnv.ORGOS_IMAP_HOST?.trim();
  const portRaw =
    process.env.ORGOS_IMAP_PORT?.trim() || fileEnv.ORGOS_IMAP_PORT?.trim();

  return {
    user,
    pass,
    host: host || undefined,
    port: portRaw ? parseInt(portRaw, 10) : undefined,
  };
}
