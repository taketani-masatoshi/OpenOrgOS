/**
 * Community connector bind nonces (Slack / Asana / Drive; Gmail delegates).
 * Path: src/lib/protocol/community-connector-bind.ts
 *
 * A bind is a single-use, short-lived nonce that ties "the operator who asked
 * for this connection in the Console" to "the OAuth callback Community will
 * receive". Without it, anyone holding the governance token could push a token
 * into an arbitrary tenant.
 *
 * Gmail keeps its own registry file (data/protocol/community-gmail-bind.yaml)
 * so already-issued binds and existing tests stay valid.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { connectorProviderSchema, type ConnectorProvider } from "../../../schemas/connectors.js";
import { getDataDir } from "../utils.js";
import { writeYamlFileAtomic } from "../yaml-atomic.js";
import {
  claimCommunityGmailBind,
  createCommunityGmailBind,
  getCommunityUrl,
  verifyCommunityGmailBind,
} from "./community-gmail-bind.js";

const DEFAULT_TTL_MINUTES = 30;

const bindEntrySchema = z.object({
  bind_id: z.string().uuid(),
  provider: connectorProviderSchema,
  tenant_id: z.string().min(1),
  nonce: z.string().min(16),
  created_at: z.string(),
  expires_at: z.string(),
  consumed_at: z.string().optional(),
  community_user_id: z.string().optional(),
  issued_for_emails: z.array(z.string().email()).optional(),
});

const bindRegistrySchema = z.object({
  version: z.literal(1).default(1),
  bindings: z.array(bindEntrySchema).default([]),
});

export type ConnectorBindEntry = z.output<typeof bindEntrySchema>;

export interface ConnectorBind {
  provider: ConnectorProvider;
  tenant_id: string;
  nonce: string;
  expires_at: string;
}

export type ConnectorBindResult =
  | { ok: true; bind: ConnectorBind }
  | { ok: false; error: string };

function bindRegistryPath(): string {
  return join(getDataDir(), "protocol", "community-connector-bind.yaml");
}

function loadBindRegistry(): z.output<typeof bindRegistrySchema> {
  const path = bindRegistryPath();
  if (!existsSync(path)) return bindRegistrySchema.parse({ version: 1, bindings: [] });
  const raw = YAML.parse(readFileSync(path, "utf-8"));
  return bindRegistrySchema.parse(raw ?? { version: 1, bindings: [] });
}

function saveBindRegistry(registry: z.output<typeof bindRegistrySchema>): void {
  mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
  writeYamlFileAtomic(bindRegistryPath(), registry);
}

export function createConnectorBind(
  provider: ConnectorProvider,
  tenantId: string,
  options?: { ttlMinutes?: number; issuedForEmails?: string[] },
): ConnectorBind {
  const ttlMinutes = options?.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  if (provider === "gmail") {
    const entry = createCommunityGmailBind(tenantId, ttlMinutes, {
      issuedForEmails: options?.issuedForEmails,
    });
    return {
      provider,
      tenant_id: entry.tenant_id,
      nonce: entry.nonce,
      expires_at: entry.expires_at,
    };
  }

  const registry = loadBindRegistry();
  const now = Date.now();
  const issuedForEmails = options?.issuedForEmails
    ?.map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const entry = bindEntrySchema.parse({
    bind_id: randomUUID(),
    provider,
    tenant_id: tenantId.trim(),
    nonce: randomBytes(24).toString("hex"),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlMinutes * 60_000).toISOString(),
    ...(issuedForEmails?.length ? { issued_for_emails: issuedForEmails } : {}),
  });
  registry.bindings.push(entry);
  saveBindRegistry(registry);
  return {
    provider,
    tenant_id: entry.tenant_id,
    nonce: entry.nonce,
    expires_at: entry.expires_at,
  };
}

export function verifyConnectorBind(
  provider: ConnectorProvider,
  tenantId: string,
  nonce: string,
): ConnectorBindResult {
  if (provider === "gmail") {
    const verified = verifyCommunityGmailBind(tenantId, nonce);
    if (!verified.ok) return { ok: false, error: verified.error };
    return {
      ok: true,
      bind: {
        provider,
        tenant_id: verified.entry.tenant_id,
        nonce: verified.entry.nonce,
        expires_at: verified.entry.expires_at,
      },
    };
  }

  const entry = loadBindRegistry().bindings.find(
    (b) =>
      b.provider === provider &&
      b.tenant_id === tenantId.trim() &&
      b.nonce === nonce.trim() &&
      !b.consumed_at,
  );
  if (!entry) return { ok: false, error: "bind not found or already used" };
  if (Date.now() > Date.parse(entry.expires_at)) {
    return { ok: false, error: "bind expired — reconnect from the Operator Console" };
  }
  return {
    ok: true,
    bind: {
      provider,
      tenant_id: entry.tenant_id,
      nonce: entry.nonce,
      expires_at: entry.expires_at,
    },
  };
}

/** Verify and consume in one step — a nonce must never authorise two pushes. */
export function claimConnectorBind(
  provider: ConnectorProvider,
  tenantId: string,
  nonce: string,
  options?: { communityUserId?: string; communityUserEmail?: string },
): ConnectorBindResult {
  if (provider === "gmail") {
    const claimed = claimCommunityGmailBind(tenantId, nonce, options);
    if (!claimed.ok) return { ok: false, error: claimed.error };
    return {
      ok: true,
      bind: {
        provider,
        tenant_id: claimed.entry.tenant_id,
        nonce: claimed.entry.nonce,
        expires_at: claimed.entry.expires_at,
      },
    };
  }

  const registry = loadBindRegistry();
  const idx = registry.bindings.findIndex(
    (b) =>
      b.provider === provider &&
      b.tenant_id === tenantId.trim() &&
      b.nonce === nonce.trim() &&
      !b.consumed_at,
  );
  if (idx < 0) return { ok: false, error: "bind not found or already used" };
  const entry = registry.bindings[idx]!;
  if (Date.now() > Date.parse(entry.expires_at)) {
    return { ok: false, error: "bind expired — reconnect from the Operator Console" };
  }
  const email = options?.communityUserEmail?.trim().toLowerCase();
  if (entry.issued_for_emails?.length && (!email || !entry.issued_for_emails.includes(email))) {
    return { ok: false, error: "community user email not authorized for this tenant bind" };
  }
  registry.bindings[idx] = {
    ...entry,
    consumed_at: new Date().toISOString(),
    community_user_id: options?.communityUserId ?? entry.community_user_id,
  };
  saveBindRegistry(registry);
  return {
    ok: true,
    bind: {
      provider,
      tenant_id: entry.tenant_id,
      nonce: entry.nonce,
      expires_at: entry.expires_at,
    },
  };
}

/** Community Connections deep link that starts the OAuth dance for a provider. */
export function buildConnectorConnectUrl(
  provider: ConnectorProvider,
  tenantId: string,
  nonce: string,
  communityUrl = getCommunityUrl(),
): string {
  const base = communityUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    connector: provider,
    tenant_id: tenantId,
    nonce,
  });
  return `${base}/settings/connections?${params.toString()}`;
}
