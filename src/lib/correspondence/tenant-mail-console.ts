/**
 * Tenant mail settings for the Operator Console company-settings page.
 * Path: src/lib/correspondence/tenant-mail-console.ts
 *
 * Secrets (SMTP password, OAuth tokens) never leave this module.
 */
import { existsSync, rmSync } from "node:fs";
import { mailConfigSchema, type MailConfig } from "../../../schemas/correspondence/mail-config.js";
import { writeYamlFile } from "../utils.js";
import { getMailConfigPath } from "./paths.js";
import { loadMailConfig, resolveMailConfig } from "./mail-config.js";
import { getGmailOAuthTokenPath, isGmailTokenExpired, loadGmailOAuthToken } from "./gmail-oauth.js";
import { loadCommunityIntegration } from "../protocol/eco-production-evidence.js";
import { communityConnectionsUrl } from "../protocol/community-gmail-bind.js";

export interface TenantMailPlatformReadiness {
  ready: boolean;
  detail: string;
}

/**
 * Whether the platform (Community) has shipped tenant mail connect.
 * Tenants cannot change this; the Console only reports it.
 */
export function tenantMailPlatformReadiness(): TenantMailPlatformReadiness {
  const shipped = loadCommunityIntegration()?.tenant_mail_connect_api === true;
  return {
    ready: shipped,
    detail: shipped
      ? "Community tenant-mail connect shipped"
      : "運営側のメール連携が未出荷です。接続は運営の出荷後に開けます。",
  };
}

export interface TenantMailStatus {
  provider: MailConfig["provider"];
  from: { name: string; email: string };
  smtp?: { host: string; port: number; secure: boolean };
  connected: boolean;
  email?: string;
  connected_via?: string;
  expired: boolean;
  platform_ready: boolean;
  platform_detail: string;
  community_connections_url: string;
  configured: boolean;
}

export function readTenantMailStatus(): TenantMailStatus {
  const token = loadGmailOAuthToken();
  const platform = tenantMailPlatformReadiness();
  const config = resolveMailConfig();
  return {
    provider: config.provider,
    from: config.from,
    smtp: config.smtp,
    connected: Boolean(token),
    email: token?.email,
    connected_via: token?.connected_via,
    expired: token ? isGmailTokenExpired(token) : false,
    platform_ready: platform.ready,
    platform_detail: platform.detail,
    community_connections_url: communityConnectionsUrl(),
    configured: loadMailConfig() !== null,
  };
}

export interface TenantMailBasicsInput {
  from?: { name?: string; email?: string };
  provider?: MailConfig["provider"];
  smtp?: { host: string; port?: number; secure?: boolean };
}

/** Update the non-secret parts of records/executive/mail-config.yaml. */
export function updateTenantMailBasics(input: TenantMailBasicsInput): MailConfig {
  const current = resolveMailConfig();
  const next = mailConfigSchema.parse({
    ...current,
    provider: input.provider ?? current.provider,
    from: {
      name: input.from?.name?.trim() || current.from.name,
      email: input.from?.email?.trim() || current.from.email,
    },
    smtp: input.smtp
      ? {
          host: input.smtp.host.trim(),
          port: input.smtp.port ?? current.smtp?.port ?? 587,
          secure: input.smtp.secure ?? current.smtp?.secure ?? false,
        }
      : current.smtp,
  });
  writeYamlFile(getMailConfigPath(), next);
  return next;
}

export interface TenantMailDisconnectResult {
  removed: boolean;
  provider: MailConfig["provider"];
}

/**
 * Drop the Gmail OAuth token and move the provider off gmail_api.
 * SMTP settings are kept so a tenant can fall back without re-entering them.
 */
export function disconnectTenantGmail(): TenantMailDisconnectResult {
  const tokenPath = getGmailOAuthTokenPath();
  const removed = existsSync(tokenPath);
  if (removed) rmSync(tokenPath);

  const current = resolveMailConfig();
  const provider: MailConfig["provider"] =
    current.provider === "gmail_api" ? (current.smtp ? "smtp" : "dry_run") : current.provider;
  if (provider !== current.provider) {
    updateTenantMailBasics({ provider });
  }
  return { removed, provider };
}
