import { existsSync, readFileSync } from "node:fs";
import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import { eventEnvelopeSchema } from "../../../schemas/protocol/org-event.js";
import { delegationProofSchema } from "../../../schemas/protocol/authority-delegation.js";
import { orgIdentityDocumentSchema } from "../../../schemas/protocol/identity-exchange.js";
import { peersRegistrySchema } from "../../../schemas/protocol/peers.js";
import { transactionsRegistrySchema } from "../../../schemas/protocol/transaction-record.js";
import { loadStakeholders } from "../data.js";
import { getStakeholdersYaml, readYamlFile } from "../utils.js";
import { verifyProtocolAuditChain } from "./audit-chain.js";
import { validateEnvelopeAgainstRegistry, loadProtocolRegistry } from "./registry.js";
import { getPeersYamlPath, getTransactionsRegistryPath } from "./paths.js";
import { isWitnessEnabled, loadWitnessPoolConfig } from "./witness-pool.js";
import { listWitnessPending } from "./witness-queue.js";
import { listTransactions } from "./transactions.js";
import { verifyCachedReceiptsForEvent } from "./witness-client.js";
import { evaluateWitnessWireGovernancePolicy } from "./witness-policy.js";

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

  try {
    loadProtocolRegistry();
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
        warnings.push({
          code: "witness-receipt-missing",
          message: `No cached witness receipts for outbound event ${tx.event_id}`,
        });
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
