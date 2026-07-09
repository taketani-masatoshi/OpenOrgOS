import { existsSync } from "node:fs";
import { join } from "node:path";
import { getTenantsDir } from "../orgos-paths.js";

/** Secretary §2.8.1 — peer 横断読取は steward://tenant/{id} のみ */
export const PEER_TENANT_ORG_URI = /^steward:\/\/tenant\/([a-z][a-z0-9_-]*)$/;

export function tenantIdFromPeerOrgUri(orgUri?: string): string | undefined {
  if (!orgUri) return undefined;
  const m = orgUri.match(PEER_TENANT_ORG_URI);
  return m?.[1];
}

export function isExternalWirePeerOrgUri(orgUri?: string): boolean {
  return orgUri?.startsWith("steward://peer/") === true;
}

export function peerTenantExists(tenantId: string): boolean {
  return existsSync(join(getTenantsDir(), tenantId, "tenant.yaml"));
}

export function peerTenantCompanyYamlPath(tenantId: string): string {
  return join(getTenantsDir(), tenantId, "data", "company.yaml");
}

export function peerTenantExternalContactsPath(tenantId: string): string {
  return join(getTenantsDir(), tenantId, "data", "executive", "external-contacts.yaml");
}

/** Secretary contact-registry が peer から読める L1 ファイルが存在するか */
export function peerTenantContactL1Available(tenantId: string): boolean {
  return (
    existsSync(peerTenantCompanyYamlPath(tenantId)) ||
    existsSync(peerTenantExternalContactsPath(tenantId))
  );
}
