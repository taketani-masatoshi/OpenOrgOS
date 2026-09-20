/**
 * Keycloak OIDC discovery only. Does not replace Community SSO.
 * Path: src/lib/integrations/sovereign/keycloak-oidc.ts
 */
import type { IamPort, PortResult } from "../ports.js";

export interface KeycloakConfig {
  baseUrl: string;
  realm: string;
}

export function keycloakConfigFromEnv(env: NodeJS.ProcessEnv = process.env): KeycloakConfig | null {
  const baseUrl = env.ORGOS_KEYCLOAK_BASE_URL?.trim();
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    realm: env.ORGOS_KEYCLOAK_REALM?.trim() || "master",
  };
}

export function keycloakDiscoveryUrl(config: KeycloakConfig): string {
  return `${config.baseUrl}/realms/${encodeURIComponent(config.realm)}/.well-known/openid-configuration`;
}

export async function discoverKeycloak(
  config: KeycloakConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<PortResult> {
  const res = await fetchImpl(keycloakDiscoveryUrl(config));
  if (!res.ok) return { ok: false, reason: `keycloak_http_${res.status}` };
  const body = (await res.json()) as { issuer?: string };
  if (!body.issuer) return { ok: false, reason: "keycloak discovery has no issuer" };
  return { ok: true, reason: "ok" };
}

export function keycloakIamPort(config: KeycloakConfig, fetchImpl: typeof fetch = fetch): IamPort {
  return {
    provider: "keycloak",
    async discover(input) {
      if (input?.dryRun) {
        return { ok: true, dryRun: true, reason: "dry_run — Keycloak へは出していません" };
      }
      return discoverKeycloak(config, fetchImpl);
    },
  };
}
