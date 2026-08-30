/**
 * Platform shipping flags for Community integration.
 * Path: src/lib/protocol/community-integration-flags.ts
 *
 * Canonical file: publish/protocol/community-integration.json.
 * `community export` preserves these flags — it never flips them automatically
 * (ADR 0004: shipping is a platform decision, not an export side effect).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";
import {
  loadCommunityIntegration,
  type CommunityIntegrationStatus,
} from "./eco-production-evidence.js";

export const COMMUNITY_INTEGRATION_FLAGS = [
  "community_ui",
  "sla_dashboard",
  "lifecycle_page",
  "trusted_operators_page",
  "governance_api",
  "e2e_green",
  "jurisdiction_registry_ui",
  "vocabulary_i18n",
  "tenant_mail_connect_api",
  "tenant_mail_connect_ui",
  "connector_slack",
  "connector_asana",
  "connector_gdrive",
] as const;

export type CommunityIntegrationFlag = (typeof COMMUNITY_INTEGRATION_FLAGS)[number];

export function isCommunityIntegrationFlag(value: string): value is CommunityIntegrationFlag {
  return (COMMUNITY_INTEGRATION_FLAGS as readonly string[]).includes(value);
}

export function communityIntegrationPath(root = getInstallRoot()): string {
  return join(root, "publish/protocol/community-integration.json");
}

export function readCommunityIntegrationFlags(
  root = getInstallRoot(),
): Record<CommunityIntegrationFlag, boolean> {
  const current = loadCommunityIntegration(root) ?? {};
  const out = {} as Record<CommunityIntegrationFlag, boolean>;
  for (const flag of COMMUNITY_INTEGRATION_FLAGS) {
    out[flag] = current[flag] === true;
  }
  return out;
}

/** Set one shipping flag. Returns the full flag map after the write. */
export function setCommunityIntegrationFlag(
  flag: CommunityIntegrationFlag,
  value: boolean,
  root = getInstallRoot(),
): Record<CommunityIntegrationFlag, boolean> {
  const path = communityIntegrationPath(root);
  const current: CommunityIntegrationStatus = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf-8")) as CommunityIntegrationStatus)
    : {};
  const next = { ...current, [flag]: value };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return readCommunityIntegrationFlags(root);
}

export type CommunityEnvProbe = {
  url: string;
  reachable: boolean;
  shipped: boolean;
  status_code?: number;
  detail: string;
};

/**
 * Ask Community whether its own env has shipped tenant-mail connect.
 * 503 means the API exists but `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED` is unset.
 */
export async function probeCommunityMailEnv(
  communityUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CommunityEnvProbe> {
  const url = `${communityUrl.replace(/\/$/, "")}/api/integrations/orgos-mail/status`;
  try {
    const res = await fetchImpl(url, { method: "GET" });
    if (res.status === 503) {
      return {
        url,
        reachable: true,
        shipped: false,
        status_code: 503,
        detail:
          "Community は応答したが未出荷。COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED を設定して再デプロイが必要。",
      };
    }
    return {
      url,
      reachable: true,
      shipped: res.ok,
      status_code: res.status,
      detail: res.ok ? "Community env 出荷済み" : `Community が ${res.status} を返した`,
    };
  } catch (err) {
    return {
      url,
      reachable: false,
      shipped: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
