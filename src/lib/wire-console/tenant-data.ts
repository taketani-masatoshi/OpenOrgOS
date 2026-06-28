import type { EventEnvelope } from "../../../schemas/protocol/org-event.js";
import type { OrgApprovalRequest } from "../../../schemas/org/approval.js";
import { exportInboxEntries, exportOutboxEntries } from "../protocol/inbox-export.js";
import { loadOutboxProvenance } from "../protocol/outbox-provenance.js";
import { getProtocolOutboxDir } from "../protocol/paths.js";
import { validateProtocolState } from "../protocol/validate.js";
import { loadTransactionsRegistry } from "../protocol/transactions.js";
import { findTransactionByEventId } from "../protocol/transactions.js";
import { loadPeersRegistry } from "../protocol/peers.js";
import { listWirePending } from "../protocol/wire-queue.js";
import { loadWireDeliveredRegistry } from "../protocol/wire-delivered.js";
import { loadWitnessPoolConfig, isWitnessEnabled } from "../protocol/witness-pool.js";
import { listWitnessPending } from "../protocol/witness-queue.js";
import { verifyCachedReceiptsForEvent } from "../protocol/witness-client.js";
import { listOrgApprovals } from "../org/approval/reject.js";
import { withWireConsoleTenant } from "./tenant-context.js";

export interface EnvelopeListItem {
  event_id: string;
  envelope_digest: string;
  recorded_at: string;
  event_type: string;
  origin_org_id: string;
  destination_org_id?: string;
  transaction_type?: string;
  direction?: string;
  has_provenance: boolean;
}

export interface EnvelopeDetail {
  event_id: string;
  envelope_digest: string;
  recorded_at: string;
  location: "outbox" | "inbox";
  envelope: EventEnvelope;
  provenance?: {
    source: string;
    written_at: string;
    digest: string;
  };
  transaction?: ReturnType<typeof findTransactionByEventId>;
  wire_delivered?: boolean;
}

function payloadSummary(payload: Record<string, unknown>): {
  transaction_type?: string;
  direction?: string;
  transaction_id?: string;
  contract_id?: string;
} {
  const refs = payload.refs as Record<string, unknown> | undefined;
  return {
    transaction_type:
      typeof payload.transaction_type === "string" ? payload.transaction_type : undefined,
    direction: typeof payload.direction === "string" ? payload.direction : undefined,
    transaction_id:
      typeof payload.transaction_id === "string" ? payload.transaction_id : undefined,
    contract_id:
      typeof payload.contract_id === "string"
        ? payload.contract_id
        : refs && typeof refs.contract_id === "string"
          ? refs.contract_id
          : undefined,
  };
}

function toListItem(
  entry: ReturnType<typeof exportOutboxEntries>[number],
  location: "outbox" | "inbox"
): EnvelopeListItem {
  const summary = payloadSummary(entry.envelope.event.payload as Record<string, unknown>);
  const hasProvenance =
    location === "outbox"
      ? !!loadOutboxProvenance(getProtocolOutboxDir(), entry.event_id)
      : false;
  return {
    event_id: entry.event_id,
    envelope_digest: entry.envelope_digest,
    recorded_at: entry.recorded_at,
    event_type: entry.envelope.event.type,
    origin_org_id: entry.envelope.origin.org_id,
    destination_org_id: entry.envelope.destination?.org_id,
    transaction_type: summary.transaction_type,
    direction: summary.direction,
    has_provenance: hasProvenance,
  };
}

export function getTenantSnapshot(tenantId: string) {
  return withWireConsoleTenant(tenantId, () => {
    const validation = validateProtocolState();
    let witnessPool: { enabled: boolean; hub_count: number } | undefined;
    try {
      const pool = loadWitnessPoolConfig();
      witnessPool = {
        enabled: isWitnessEnabled(pool),
        hub_count: pool.hubs?.length ?? 0,
      };
    } catch {
      witnessPool = { enabled: false, hub_count: 0 };
    }
    return {
      tenant_id: tenantId,
      validation,
      counts: {
        outbox: exportOutboxEntries().length,
        inbox: exportInboxEntries().length,
        transactions: loadTransactionsRegistry().transactions.length,
        wire_pending: listWirePending().length,
        witness_pending: listWitnessPending().length,
      },
      witness_pool: witnessPool,
    };
  });
}

export function getTenantOutbox(tenantId: string, limit?: number): EnvelopeListItem[] {
  return withWireConsoleTenant(tenantId, () =>
    exportOutboxEntries({ limit: limit ?? 100 }).map((e) => toListItem(e, "outbox"))
  );
}

export function getTenantInbox(tenantId: string, limit?: number): EnvelopeListItem[] {
  return withWireConsoleTenant(tenantId, () =>
    exportInboxEntries({ limit: limit ?? 100 }).map((e) => toListItem(e, "inbox"))
  );
}

export function getTenantLedger(tenantId: string) {
  return withWireConsoleTenant(tenantId, () => loadTransactionsRegistry().transactions);
}

export function getTenantPeers(tenantId: string) {
  return withWireConsoleTenant(tenantId, () => loadPeersRegistry().peers);
}

export function getTenantApprovals(tenantId: string, scope?: OrgApprovalRequest["scope"]) {
  return withWireConsoleTenant(tenantId, () =>
    listOrgApprovals(scope ? { scope } : undefined)
  );
}

export function getTenantDelivery(tenantId: string) {
  return withWireConsoleTenant(tenantId, () => ({
    pending: listWirePending(),
    delivered: loadWireDeliveredRegistry().delivered,
  }));
}

export function getTenantEventDetail(
  tenantId: string,
  eventId: string
): EnvelopeDetail | undefined {
  return withWireConsoleTenant(tenantId, () => {
    const outbox = exportOutboxEntries().find((e) => e.event_id === eventId);
    const inbox = exportInboxEntries().find((e) => e.event_id === eventId);
    const entry = outbox ?? inbox;
    if (!entry) return undefined;

    const location: "outbox" | "inbox" = outbox ? "outbox" : "inbox";
    const provenanceRaw =
      location === "outbox" ? loadOutboxProvenance(getProtocolOutboxDir(), eventId) : undefined;
    const tx = findTransactionByEventId(eventId);
    const delivered = loadWireDeliveredRegistry().delivered.some((d) => d.event_id === eventId);

    return {
      event_id: eventId,
      envelope_digest: entry.envelope_digest,
      recorded_at: entry.recorded_at,
      location,
      envelope: entry.envelope,
      provenance: provenanceRaw
        ? {
            source: provenanceRaw.source,
            written_at: provenanceRaw.written_at,
            digest: provenanceRaw.digest,
          }
        : undefined,
      transaction: tx,
      wire_delivered: delivered,
    };
  });
}

export interface WorkflowStep {
  id: "approval" | "outbox" | "delivery" | "witness";
  label: string;
  status: "done" | "pending" | "queued" | "partial" | "rejected" | "n/a";
  detail?: string;
}

export function getTenantWitnessStatus(tenantId: string) {
  return withWireConsoleTenant(tenantId, () => {
    let pool: { enabled: boolean; hub_count: number; quorum_mode?: string } = {
      enabled: false,
      hub_count: 0,
    };
    try {
      const cfg = loadWitnessPoolConfig();
      pool = {
        enabled: isWitnessEnabled(cfg),
        hub_count: cfg.hubs?.length ?? 0,
        quorum_mode: cfg.quorum?.mode,
      };
    } catch {
      /* optional */
    }
    return {
      pool,
      pending: listWitnessPending(),
    };
  });
}

export function getTenantEventWorkflow(tenantId: string, eventId: string) {
  return withWireConsoleTenant(tenantId, () => {
    const approval = listOrgApprovals({ scope: "wire" }).find(
      (a) => a.wire?.wire_event_id === eventId
    );
    const detail = getTenantEventDetail(tenantId, eventId);
    const wirePending = listWirePending().some((p) => p.event_id === eventId);
    const delivered = loadWireDeliveredRegistry().delivered.some((d) => d.event_id === eventId);

    let witnessStatus: WorkflowStep["status"] = "pending";
    let witnessDetail = "no receipts";
    let quorumSatisfied = false;
    try {
      const v = verifyCachedReceiptsForEvent(eventId);
      quorumSatisfied = v.quorum.satisfied;
      if (v.quorum.satisfied) {
        witnessStatus = "done";
        witnessDetail = `quorum ${v.quorum.matched}/${v.quorum.required}`;
      } else if (v.receipts.length > 0) {
        witnessStatus = "partial";
        witnessDetail = `${v.receipts.length} receipt(s) · quorum ${v.quorum.matched}/${v.quorum.required}`;
      }
    } catch {
      /* optional */
    }

    let approvalStatus: WorkflowStep["status"] = "n/a";
    let approvalDetail: string | undefined;
    if (approval) {
      if (approval.status === "completed") {
        approvalStatus = "done";
        approvalDetail = approval.approver_id;
      } else if (approval.status === "rejected") {
        approvalStatus = "rejected";
      } else if (approval.status === "pending_approval") {
        approvalStatus = "pending";
      } else {
        approvalStatus = "partial";
        approvalDetail = approval.status;
      }
    }

    const steps: WorkflowStep[] = [
      {
        id: "approval",
        label: "Approval",
        status: approvalStatus,
        detail: approvalDetail,
      },
      {
        id: "outbox",
        label: "Outbox",
        status: detail?.location === "outbox" ? "done" : detail ? "done" : "pending",
        detail: detail?.location,
      },
      {
        id: "delivery",
        label: "Delivery",
        status: delivered ? "done" : wirePending ? "queued" : "pending",
        detail: delivered ? "delivered" : wirePending ? "queued" : undefined,
      },
      {
        id: "witness",
        label: "Witness",
        status: witnessStatus,
        detail: witnessDetail,
      },
    ];

    return {
      event_id: eventId,
      approval_id: approval?.approval_id,
      peer_id: approval?.wire?.peer_id,
      wire_delivered: delivered,
      wire_pending: wirePending,
      quorum_satisfied: quorumSatisfied,
      steps,
    };
  });
}
