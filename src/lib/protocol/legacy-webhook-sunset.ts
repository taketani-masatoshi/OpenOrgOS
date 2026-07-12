/**
 * Wire legacy_webhook transport sunset — distinct from internal OrgOS automation webhook.
 */

import type { PeerProfile } from "../../../schemas/protocol/peers.js";
import { listRosterManagedTenants } from "../tenant-roster-bootstrap.js";
import { setTenantId } from "../tenant.js";
import { listLegacyTransportPeers } from "./peers-migrate-legacy.js";

export function listLegacyWebhookPeersForTenant(): PeerProfile[] {
  return listLegacyTransportPeers();
}

export function validateLegacyWebhookSunset(strict = true): string[] {
  const issues: string[] = [];
  const previousTenant = process.env.ORGOS_TENANT;

  for (const tenantId of listRosterManagedTenants()) {
    setTenantId(tenantId);
    const legacy = listLegacyTransportPeers();
    if (!legacy.length) continue;
    for (const peer of legacy) {
      const message = `${tenantId}/${peer.peer_id}: legacy_webhook transport — migrate with orgos wire peer migrate-legacy`;
      if (strict) issues.push(message);
    }
  }

  if (previousTenant) setTenantId(previousTenant);
  else delete process.env.ORGOS_TENANT;

  return [...new Set(issues)];
}

/** Call only on legacy_webhook delivery paths. No-op unless ORGOS_STRICT_TRANSPORT=1. */
export function assertLegacyWebhookDeliveryAllowed(operation: string): void {
  if (process.env.ORGOS_STRICT_TRANSPORT !== "1") return;
  throw new Error(
    `${operation} blocked: ORGOS_STRICT_TRANSPORT=1 — Wire legacy_webhook is sunset; use wire_v1 via orgos wire`
  );
}

/** @deprecated Use assertLegacyWebhookDeliveryAllowed */
export function assertStrictTransportAllowed(operation: string): void {
  assertLegacyWebhookDeliveryAllowed(operation);
}
