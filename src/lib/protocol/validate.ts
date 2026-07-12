import { existsSync, readFileSync } from "node:fs";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { eventEnvelopeSchema } from "../../../schemas/protocol/org-event.js";
import { delegationProofSchema } from "../../../schemas/protocol/authority-delegation.js";
import { orgIdentityDocumentSchema } from "../../../schemas/protocol/identity-exchange.js";
import { peersRegistrySchema } from "../../../schemas/protocol/peers.js";
import { transactionsRegistrySchema } from "../../../schemas/protocol/transaction-record.js";
import { readYamlFile, getStakeholdersYaml } from "../utils.js";
import { loadStakeholders } from "../data.js";
import {
  peerTenantContactL1Available,
  peerTenantExists,
  tenantIdFromPeerOrgUri,
} from "../secretary/peer-contact-policy.js";
import { verifyProtocolAuditChain } from "./audit-chain.js";
import { validateEnvelopeAgainstRegistry, loadProtocolRegistry } from "./registry.js";
import { getPeersYamlPath, getTransactionsRegistryPath } from "./paths.js";
import { resolveWitnessWireGovernancePolicy } from "../../../schemas/protocol/witness-pool.js";
import { isWitnessEnabled, loadWitnessPoolConfig } from "./witness-pool.js";
import { listWitnessPending } from "./witness-queue.js";
import { listTransactions } from "./transactions.js";
import { verifyCachedReceiptsForEvent } from "./witness-client.js";
import { evaluateWitnessWireGovernancePolicy } from "./witness-policy.js";
import { loadOrgAuditBridgeConfig } from "../org/audit-bridge.js";
import { listRecentAuditBridgeFailures } from "../org/audit-bridge-errors.js";
import { getOrgAuditBridgeConfigPath } from "../org/paths.js";
import { validateTrustedHubsRegistry } from "./trusted-hubs.js";
import { loadSigningKeyMeta } from "./signing.js";
import { loadPeersRegistry } from "./peers.js";
import { resolvePeerInboundEndpoints } from "./peers.js";
import { isLegacyWebhookEndpoint } from "../../../schemas/protocol/peer-endpoint.js";
import { getProtocolOutboxDir } from "./paths.js";
import { listOutboxEventIdsWithoutProvenance } from "./outbox-provenance.js";
import { isProtocolWriteGuardDisabled } from "./protocol-write-guard.js";
import { checkProtocolOutboxPermissionsLoose } from "./outbox-permissions.js";
import { isPkDidRequired, isPkPrefixedOpenOrgDid } from "../../../schemas/protocol/openorg-did.js";
import { loadTenantConfig } from "../tenant.js";

export interface ProtocolValidationIssue {
  code: string;
  message: string;
}

export interface ValidateProtocolStateResult {
  ok: boolean;
  issues: ProtocolValidationIssue[];
  warnings: ProtocolValidationIssue[];
}

export interface ValidateProtocolStateOptions {
  /** Peer-less tenant: skip peer orphan checks; witness pool must be disabled or empty. */
  standalone?: boolean;
}

function fileExists(path: string): boolean {
  return existsSync(path);
}

function isWitnessPoolActive(): boolean {
  try {
    const pool = loadWitnessPoolConfig();
    return isWitnessEnabled(pool);
  } catch {
    return false;
  }
}

export function validateProtocolState(
  options?: ValidateProtocolStateOptions
): ValidateProtocolStateResult {
  const issues: ProtocolValidationIssue[] = [];
  const warnings: ProtocolValidationIssue[] = [];
  const standalone = options?.standalone === true;

  if (existsSync(getOrgAuditBridgeConfigPath())) {
    const bridge = loadOrgAuditBridgeConfig();
    if (!bridge.enabled) {
      warnings.push({
        code: "audit-bridge-disabled",
        message:
          "Operational audit mirror to protocol chain is disabled (data/org/audit-bridge.yaml)",
      });
    }
  }

  for (const failure of listRecentAuditBridgeFailures()) {
    warnings.push({
      code: "audit-bridge-failed",
      message: `${failure.audit_id} (${failure.audit_event}): ${failure.message}`,
    });
  }

  try {
    const registry = loadProtocolRegistry();
    for (const eventType of registry.core_event_types) {
      if (!registry.core_event_scopes?.[eventType]) {
        warnings.push({
          code: "event-scope-unknown",
          message: `Registry event ${eventType} missing core_event_scopes entry`,
        });
      }
    }
  } catch (e) {
    issues.push({
      code: "registry-invalid",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (standalone && isWitnessPoolActive()) {
    issues.push({
      code: "standalone-witness-enabled",
      message: "standalone mode requires witness pool disabled or hubs: []",
    });
  }

  if (fileExists(getPeersYamlPath())) {
    try {
      const peers = readYamlFile(getPeersYamlPath(), peersRegistrySchema);
      if (standalone && peers.peers.length > 0) {
        issues.push({
          code: "standalone-peers-configured",
          message: `standalone mode expects no peers (found ${peers.peers.length})`,
        });
      }
      if (!standalone) {
        const stkIds = new Set<string>();
        if (fileExists(getStakeholdersYaml())) {
          try {
            for (const s of loadStakeholders().stakeholders) {
              stkIds.add(s.id);
            }
          } catch {
            /* optional */
          }
        }
        for (const peer of peers.peers) {
          if (peer.stakeholder_id && stkIds.size > 0 && !stkIds.has(peer.stakeholder_id)) {
            issues.push({
              code: "peer-stakeholder-orphan",
              message: `${peer.peer_id} references unknown stakeholder ${peer.stakeholder_id}`,
            });
          }
          const tenantId = tenantIdFromPeerOrgUri(peer.org_uri);
          if (peer.org_uri?.startsWith("steward://tenant/")) {
            if (!tenantId) {
              warnings.push({
                code: "peer-org-uri-invalid",
                message: `${peer.peer_id}: invalid steward://tenant/{id} in org_uri`,
              });
            } else if (!peerTenantExists(tenantId)) {
              issues.push({
                code: "peer-tenant-missing",
                message: `${peer.peer_id} → tenants/${tenantId} not found (Secretary contact gate broken)`,
              });
            } else if (!peerTenantContactL1Available(tenantId)) {
              warnings.push({
                code: "peer-tenant-l1-contacts-missing",
                message: `${peer.peer_id} → tenant/${tenantId} lacks company.yaml and external-contacts.yaml`,
              });
            }
          } else if (!peer.org_uri) {
            warnings.push({
              code: "peer-org-uri-missing",
              message: `${peer.peer_id} (${peer.display_name}): no org_uri — Secretary peer contact resolve disabled`,
            });
          }
          if (peer.did && isPkDidRequired() && !isPkPrefixedOpenOrgDid(peer.did)) {
            issues.push({
              code: "peer-slug-did-disallowed",
              message: `${peer.peer_id}: peer did must be pk-prefixed when ORGOS_REQUIRE_PK_DID / ORGOS_STRICT_TRUST`,
            });
          }
        }
      }
    } catch (e) {
      issues.push({
        code: "peers-invalid",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (fileExists(getTransactionsRegistryPath())) {
    try {
      const registry = readYamlFile(getTransactionsRegistryPath(), transactionsRegistrySchema);
      const eventIds = new Set<string>();
      for (const tx of registry.transactions) {
        if (eventIds.has(tx.event_id)) {
          issues.push({
            code: "transaction-duplicate-event",
            message: `duplicate event_id ${tx.event_id} in transactions registry`,
          });
        }
        eventIds.add(tx.event_id);
      }
    } catch (e) {
      issues.push({
        code: "transactions-invalid",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const chain = verifyProtocolAuditChain();
  if (!chain.ok) {
    for (const issue of chain.issues) {
      issues.push({ code: "audit-chain", message: `${issue.audit_id}: ${issue.message}` });
    }
  }

  if (!standalone && isWitnessPoolActive()) {
    const pool = loadWitnessPoolConfig();
    for (const pending of listWitnessPending()) {
      warnings.push({
        code: "witness-pending",
        message: `Witness pending ${pending.side} on ${pending.hub_id} for ${pending.event_id}`,
      });
    }

    for (const tx of listTransactions()) {
      if (tx.direction !== "outbound") continue;
      const { receipts, quorum } = verifyCachedReceiptsForEvent(tx.event_id, pool);
      if (receipts.length === 0) {
        const entry = {
          code: "witness-receipt-missing",
          message: `No cached witness receipts for outbound event ${tx.event_id}`,
        };
        const warnOnly = resolveWitnessWireGovernancePolicy(pool)?.warn_only ?? true;
        if (!warnOnly) {
          issues.push(entry);
        } else {
          warnings.push(entry);
        }
        continue;
      }
      if (!quorum.satisfied) {
        const tier = (tx as { approval_tier?: string }).approval_tier ?? "C";
        const wireGovernance = evaluateWitnessWireGovernancePolicy({
          tier: tier as "A" | "B" | "C",
          quorum,
          pool,
        });
        const entry = {
          code: "witness-quorum-pending",
          message: `Witness quorum not satisfied for ${tx.event_id} (${quorum.matched}/${quorum.required})`,
        };
        if (wireGovernance.required && !wireGovernance.warnOnly) {
          issues.push(entry);
        } else {
          warnings.push(entry);
        }
      }
    }
  }

  const trustedHubs = validateTrustedHubsRegistry();
  for (const issue of trustedHubs.issues) {
    issues.push(issue);
  }
  for (const warning of trustedHubs.warnings) {
    warnings.push(warning);
  }

  const keyMeta = loadSigningKeyMeta();
  if (keyMeta) {
    try {
      const ourUri = `steward://tenant/${loadTenantConfig().id}`;
      for (const peer of loadPeersRegistry().peers) {
        // Only self/loopback peers should pin our signing public key.
        if (peer.org_uri !== ourUri) continue;
        if (peer.protocol_public_key && peer.protocol_public_key !== keyMeta.public_key) {
          warnings.push({
            code: "signing-key-peer-pin-stale",
            message: `${peer.peer_id} protocol_public_key does not match signing-key-meta (rotated ${keyMeta.rotated_at})`,
          });
        }
      }
    } catch {
      /* peers-invalid reported above */
    }
  }

  if (!isProtocolWriteGuardDisabled()) {
    const unprovenanced = listOutboxEventIdsWithoutProvenance(getProtocolOutboxDir());
    for (const eventId of unprovenanced) {
      issues.push({
        code: "outbox-provenance-missing",
        message: `Outbox ${eventId}.json lacks steward-provenance (direct write blocked)`,
      });
    }
  }

  for (const perm of checkProtocolOutboxPermissionsLoose()) {
    const asIssue = process.env.STEWARD_ENFORCE_OUTBOX_PERMISSIONS === "1";
    (asIssue ? issues : warnings).push({
      code: perm.code,
      message: perm.message,
    });
  }

  const strictTransport = process.env.ORGOS_STRICT_TRANSPORT === "1";
  try {
    for (const peer of loadPeersRegistry().peers) {
      const legacy =
        Boolean(peer.inbound_webhook_url) ||
        resolvePeerInboundEndpoints(peer).some((ep) => isLegacyWebhookEndpoint(ep));
      if (!legacy) continue;
      const entry = {
        code: "legacy-webhook-transport",
        message: `${peer.peer_id}: legacy_webhook / inbound_webhook_url in use (sunset 2026-10-01; migrate to wire_v1)`,
      };
      if (strictTransport) issues.push(entry);
      else warnings.push(entry);
    }
  } catch {
    /* peers-invalid reported above */
  }

  return { ok: issues.length === 0, issues, warnings };
}

export function validateProtocolFile(
  filePath: string,
  kind: "envelope" | "identity" | "delegation"
): { ok: boolean; error?: string } {
  const content = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content) as unknown;

  if (kind === "envelope") {
    const result = eventEnvelopeSchema.safeParse(parsed);
    if (!result.success) return { ok: false, error: result.error.message };
    const typeIssue = validateEnvelopeAgainstRegistry(result.data.event.type);
    if (typeIssue) return { ok: false, error: typeIssue };
    return { ok: true };
  }

  if (kind === "identity") {
    const envelope = eventEnvelopeSchema.safeParse(parsed);
    if (envelope.success) {
      const inner = orgIdentityDocumentSchema.safeParse(envelope.data.event.payload.identity);
      if (!inner.success) return { ok: false, error: inner.error.message };
      return { ok: true };
    }
    const doc = orgIdentityDocumentSchema.safeParse(parsed);
    if (!doc.success) return { ok: false, error: doc.error.message };
    return { ok: true };
  }

  if (kind === "delegation") {
    const envelope = eventEnvelopeSchema.safeParse(parsed);
    if (envelope.success) {
      const inner = delegationProofSchema.safeParse(envelope.data.event.payload.proof);
      if (!inner.success) return { ok: false, error: inner.error.message };
      return { ok: true };
    }
    const proof = delegationProofSchema.safeParse(parsed);
    if (!proof.success) return { ok: false, error: proof.error.message };
    return { ok: true };
  }

  return { ok: false, error: "unknown kind" };
}

export function validateEnvelopeObject(envelope: EventEnvelope): string | null {
  const parsed = eventEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) return parsed.error.message;
  return validateEnvelopeAgainstRegistry(parsed.data.event.type);
}
