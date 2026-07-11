import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { getDataDir } from "../utils.js";

const bindEntrySchema = z.object({
  bind_id: z.string().uuid(),
  tenant_id: z.string().min(1),
  nonce: z.string().min(16),
  created_at: z.string(),
  expires_at: z.string(),
  consumed_at: z.string().optional(),
  community_user_id: z.string().optional(),
});

const bindRegistrySchema = z.object({
  version: z.literal(1).default(1),
  bindings: z.array(bindEntrySchema).default([]),
});

export type CommunityGmailBindEntry = z.output<typeof bindEntrySchema>;

function bindRegistryPath(): string {
  return join(getDataDir(), "protocol", "community-gmail-bind.yaml");
}

function loadBindRegistry(): z.output<typeof bindRegistrySchema> {
  const path = bindRegistryPath();
  if (!existsSync(path)) {
    return bindRegistrySchema.parse({ version: 1, bindings: [] });
  }
  const raw = YAML.parse(readFileSync(path, "utf-8"));
  return bindRegistrySchema.parse(raw ?? { version: 1, bindings: [] });
}

function saveBindRegistry(registry: z.output<typeof bindRegistrySchema>): void {
  const path = bindRegistryPath();
  mkdirSync(join(getDataDir(), "protocol"), { recursive: true });
  writeFileSync(path, YAML.stringify(registry), "utf-8");
}

export function createCommunityGmailBind(tenantId: string, ttlMinutes = 30): CommunityGmailBindEntry {
  const registry = loadBindRegistry();
  const now = Date.now();
  const entry = bindEntrySchema.parse({
    bind_id: randomUUID(),
    tenant_id: tenantId.trim(),
    nonce: randomBytes(24).toString("hex"),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlMinutes * 60_000).toISOString(),
  });
  registry.bindings.push(entry);
  saveBindRegistry(registry);
  return entry;
}

export function verifyCommunityGmailBind(
  tenantId: string,
  nonce: string
): { ok: true; entry: CommunityGmailBindEntry } | { ok: false; error: string } {
  const registry = loadBindRegistry();
  const entry = registry.bindings.find(
    (b) => b.tenant_id === tenantId.trim() && b.nonce === nonce.trim() && !b.consumed_at
  );
  if (!entry) {
    return { ok: false, error: "bind not found or already used" };
  }
  if (Date.now() > Date.parse(entry.expires_at)) {
    return { ok: false, error: "bind expired — re-run orgos mail setup gmail --community-link" };
  }
  return { ok: true, entry };
}

export function getCommunityUrl(): string {
  return process.env.ORGOS_COMMUNITY_URL?.trim() || "https://community.oorgos.org";
}

export function buildCommunityMailConnectUrl(
  tenantId: string,
  nonce: string,
  communityUrl = getCommunityUrl()
): string {
  const base = communityUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    orgos_mail: "1",
    tenant_id: tenantId,
    nonce,
  });
  return `${base}/settings/connections?${params.toString()}`;
}

export async function createCommunityGmailBindRemote(
  stewardUrl: string,
  tenantId: string,
  options?: { ttlMinutes?: number; governanceToken?: string }
): Promise<{ tenant_id: string; nonce: string; expires_at: string }> {
  const token = options?.governanceToken ?? process.env.ORGOS_COMMUNITY_GOVERNANCE_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "ORGOS_COMMUNITY_GOVERNANCE_TOKEN required for remote bind (ORGOS_STEWARD_PROTOCOL_URL set)"
    );
  }
  const base = stewardUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/protocol/v1/community/tenant-mail/bind`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      ttl_minutes: options?.ttlMinutes ?? 30,
    }),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    tenant_id?: string;
    nonce?: string;
    expires_at?: string;
    error?: string;
  };
  if (!res.ok || !body.ok || !body.nonce) {
    throw new Error(body.error ?? `remote bind failed (${res.status})`);
  }
  return {
    tenant_id: body.tenant_id ?? tenantId,
    nonce: body.nonce,
    expires_at: body.expires_at ?? "",
  };
}

export async function resolveCommunityGmailBindForCli(
  tenantId: string,
  options?: { ttlMinutes?: number }
): Promise<{ tenant_id: string; nonce: string; expires_at: string; remote: boolean }> {
  const stewardUrl = process.env.ORGOS_STEWARD_PROTOCOL_URL?.trim();
  if (stewardUrl) {
    const remote = await createCommunityGmailBindRemote(stewardUrl, tenantId, options);
    return { ...remote, remote: true };
  }
  const entry = createCommunityGmailBind(tenantId, options?.ttlMinutes ?? 30);
  return {
    tenant_id: entry.tenant_id,
    nonce: entry.nonce,
    expires_at: entry.expires_at,
    remote: false,
  };
}

export function consumeCommunityGmailBind(
  tenantId: string,
  nonce: string,
  communityUserId?: string
): boolean {
  const registry = loadBindRegistry();
  const idx = registry.bindings.findIndex(
    (b) => b.tenant_id === tenantId.trim() && b.nonce === nonce.trim() && !b.consumed_at
  );
  if (idx < 0) return false;
  const entry = registry.bindings[idx]!;
  if (Date.now() > Date.parse(entry.expires_at)) return false;
  registry.bindings[idx] = {
    ...entry,
    consumed_at: new Date().toISOString(),
    community_user_id: communityUserId ?? entry.community_user_id,
  };
  saveBindRegistry(registry);
  return true;
}
