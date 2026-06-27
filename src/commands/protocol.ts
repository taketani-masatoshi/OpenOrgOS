import { setTenantId, loadTenantConfig } from "../lib/tenant.js";
import {
  buildIdentityDocument,
  buildIdentityEnvelope,
} from "../lib/protocol/identity.js";
import {
  exportDelegationProof,
  buildDelegationEnvelope,
} from "../lib/protocol/delegation.js";
import {
  proposeInterOrgWire,
  approveInterOrgNotice,
  rejectInterOrgNotice,
  listPendingNotices,
  findPendingNotice,
} from "../lib/protocol/notice-workflow.js";
import { findPeer, registerPeer, nextPeerId } from "../lib/protocol/peers.js";
import {
  findTransaction,
  listTransactions,
} from "../lib/protocol/transactions.js";
import {
  recordProtocolTransaction,
} from "../lib/protocol/record-transaction.js";
import { validateProtocolState, validateProtocolFile } from "../lib/protocol/validate.js";
import { verifyProtocolAuditChain } from "../lib/protocol/audit-chain.js";
import { mapQueueEventToOrgEvent } from "../lib/protocol/map-internal.js";
import { loadProtocolRegistry } from "../lib/protocol/registry.js";
import type { TransactionType } from "../../schemas/protocol/transaction-record.js";
import { transactionTypeSchema } from "../../schemas/protocol/transaction-record.js";
import { eventEnvelopeSchema } from "../../schemas/protocol/org-event.js";
import { loadQueueEvents } from "../lib/queue-db.js";
import { exportProtocolPublicKeyBase64, ensureProtocolSigningKey } from "../lib/protocol/signing.js";
import {
  deliverProtocolEnvelope,
  deliverProtocolEnvelopeWithRelay,
  flushWirePending,
} from "../lib/protocol/transport.js";
import {
  evaluateWitnessWireGovernancePolicy,
  formatWitnessWireGovernancePolicySummary,
} from "../lib/protocol/witness-policy.js";
import {
  findTrustedHubsForJurisdiction,
} from "../lib/protocol/trusted-hubs.js";
import { loadAuthorizedApprovers } from "../lib/protocol/wire-approval-gate.js";
import { readFileSync } from "node:fs";
import { orgIdentityDocumentSchema } from "../../schemas/protocol/identity-exchange.js";

export interface ProtocolValidateOptions {
  tenant?: string;
  json?: boolean;
  standalone?: boolean;
}

export function runProtocolValidate(opts: ProtocolValidateOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const result = validateProtocolState({ standalone: opts.standalone });
  if (opts.json) {
    console.log(JSON.stringify({ ...result, mode: opts.standalone ? "standalone" : "full" }, null, 2));
    return;
  }
  if (result.ok) {
    console.log(`✓ Protocol state OK${opts.standalone ? " (standalone)" : ""}`);
    if (result.warnings.length) {
      console.log(`  warnings (${result.warnings.length}):`);
      for (const w of result.warnings) {
        console.log(`    [${w.code}] ${w.message}`);
      }
    }
    const registry = loadProtocolRegistry();
    console.log(`  protocol_version: ${registry.protocol_version}`);
    console.log(`  core_event_types: ${registry.core_event_types.length}`);
    return;
  }
  console.error("✗ Protocol validation failed:");
  for (const issue of result.issues) {
    console.error(`  [${issue.code}] ${issue.message}`);
  }
  process.exit(1);
}

export interface ProtocolIdentityExportOptions {
  peer?: string;
  stakeholder?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolIdentityExport(opts: ProtocolIdentityExportOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const doc = buildIdentityDocument({ stakeholderId: opts.stakeholder });
  let destination;
  if (opts.peer) {
    const peer = findPeer(opts.peer);
    if (!peer) {
      console.error(`Peer ${opts.peer} not found`);
      process.exit(1);
    }
    destination = { org_id: peer.peer_id, org_uri: peer.org_uri };
  }
  const envelope = buildIdentityEnvelope(doc, destination);
  if (opts.json) {
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  console.log(`✓ Identity envelope ${envelope.event_id}`);
  console.log(`  org: ${doc.display_name} (${doc.jurisdiction})`);
}

export interface ProtocolIdentityValidateOptions {
  file: string;
}

export function runProtocolIdentityValidate(opts: ProtocolIdentityValidateOptions): void {
  const result = validateProtocolFile(opts.file, "identity");
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log("✓ Identity document valid");
}

export interface ProtocolPeerRegisterOptions {
  stakeholder?: string;
  name: string;
  jurisdiction: string;
  peerId?: string;
  orgUri?: string;
  publicKey?: string;
  identityFile?: string;
  webhookUrl?: string;
  tenant?: string;
}

export function runProtocolPeerRegister(opts: ProtocolPeerRegisterOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const peerId = opts.peerId ?? nextPeerId();
  let protocolPublicKey = opts.publicKey;
  if (opts.identityFile) {
    const raw = JSON.parse(readFileSync(opts.identityFile, "utf-8")) as Record<string, unknown>;
    const docDirect = orgIdentityDocumentSchema.safeParse(raw);
    if (docDirect.success) {
      protocolPublicKey = docDirect.data.protocol_public_key ?? protocolPublicKey;
    } else if (typeof raw === "object" && raw !== null && "event" in raw) {
      const payload = (raw as { event?: { payload?: { identity?: unknown } } }).event?.payload
        ?.identity;
      const docInner = orgIdentityDocumentSchema.safeParse(payload);
      if (docInner.success) {
        protocolPublicKey = docInner.data.protocol_public_key ?? protocolPublicKey;
      }
    }
  }
  const profile = registerPeer({
    peer_id: peerId,
    display_name: opts.name,
    jurisdiction: opts.jurisdiction,
    stakeholder_id: opts.stakeholder,
    org_uri: opts.orgUri,
    protocol_public_key: protocolPublicKey,
    inbound_webhook_url: opts.webhookUrl,
  });
  console.log(`✓ Registered peer ${profile.peer_id} · ${profile.display_name}`);
  if (profile.protocol_public_key) console.log(`  protocol_public_key: set`);
  if (profile.inbound_webhook_url) console.log(`  inbound_webhook_url: ${profile.inbound_webhook_url}`);
}

export interface ProtocolDelegationExportOptions {
  scope: string;
  granteeAgent: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolDelegationExport(opts: ProtocolDelegationExportOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  try {
    const proof = exportDelegationProof({
      scope: opts.scope,
      granteeAgent: opts.granteeAgent,
    });
    const envelope = buildDelegationEnvelope(proof);
    if (opts.json) {
      console.log(JSON.stringify(envelope, null, 2));
      return;
    }
    console.log(`✓ Delegation proof ${proof.grant.grant_id}`);
    console.log(`  scope: ${proof.grant.scope.join(", ")}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface ProtocolDelegationValidateOptions {
  file: string;
}

export function runProtocolDelegationValidate(opts: ProtocolDelegationValidateOptions): void {
  const result = validateProtocolFile(opts.file, "delegation");
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log("✓ Delegation proof valid");
}

export interface ProtocolTransactionRecordOptions {
  type: string;
  contract?: string;
  peer: string;
  invoice?: string;
  brokerInstruction?: string;
  amount?: number;
  currency?: string;
  stakeholder?: string;
  notes?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolTransactionRecord(opts: ProtocolTransactionRecordOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const parsedType = transactionTypeSchema.safeParse(opts.type);
  if (!parsedType.success) {
    console.error(`Invalid transaction type: ${opts.type}`);
    process.exit(1);
  }

  if (parsedType.data === "contract.execution.notice") {
    console.error(
      "Use `steward protocol notice propose` + `notice approve` for execution notices (operator + approver required)"
    );
    process.exit(1);
  }

  const outboundWireTypes = [
    "contract.executed",
    "invoice.issued",
    "payment.instructed",
    "obligation.acknowledged",
  ] as const;
  if (outboundWireTypes.includes(parsedType.data as (typeof outboundWireTypes)[number])) {
    console.error(
      `Use \`steward protocol notice propose --type ${parsedType.data}\` + \`notice approve\` for outbound wire`
    );
    process.exit(1);
  }

  try {
    const result = recordProtocolTransaction({
      transactionType: parsedType.data as TransactionType,
      peerId: opts.peer,
      direction: "inbound",
      contractId: opts.contract,
      invoiceId: opts.invoice,
      brokerInstruction: opts.brokerInstruction,
      stakeholderId: opts.stakeholder,
      amount:
        opts.amount != null
          ? { value: opts.amount, currency: opts.currency ?? "JPY" }
          : undefined,
      notes: opts.notes,
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`✓ ${result.transaction.transaction_id} · ${result.transaction.transaction_type}`);
    console.log(`  event_id: ${result.envelope.event_id}`);
    console.log(`  audit: ${result.auditRecordId}`);
    if (result.outboxPath) {
      console.log(`  outbox: ${result.outboxPath}`);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface ProtocolTransactionListOptions {
  peer?: string;
  since?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolTransactionList(opts: ProtocolTransactionListOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const rows = listTransactions({ peerId: opts.peer, since: opts.since });
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("No transactions.");
    return;
  }
  console.log("| id | type | peer | direction | recorded |");
  console.log("|----|------|------|-----------|----------|");
  for (const t of rows) {
    console.log(
      `| ${t.transaction_id} | ${t.transaction_type} | ${t.counterparty.org_id} | ${t.direction} | ${t.recorded_at.slice(0, 10)} |`
    );
  }
}

export interface ProtocolTransactionShowOptions {
  id: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolTransactionShow(opts: ProtocolTransactionShowOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const tx = findTransaction(opts.id);
  if (!tx) {
    console.error(`Transaction ${opts.id} not found`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(tx, null, 2));
    return;
  }
  console.log(`# ${tx.transaction_id}`);
  console.log(`type: ${tx.transaction_type}`);
  console.log(`direction: ${tx.direction}`);
  console.log(`counterparty: ${tx.counterparty.org_id}`);
  console.log(`event_id: ${tx.event_id}`);
  if (tx.amount) console.log(`amount: ${tx.amount.value} ${tx.amount.currency}`);
  if (tx.notes) console.log(`notes: ${tx.notes}`);
}

export interface ProtocolAuditVerifyOptions {
  since?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolAuditVerify(opts: ProtocolAuditVerifyOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const result = verifyProtocolAuditChain({ since: opts.since });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.ok) {
    console.log(`✓ Audit chain OK (${result.checked} records)`);
    return;
  }
  console.error("✗ Audit chain issues:");
  for (const issue of result.issues) {
    console.error(`  ${issue.audit_id}: ${issue.message}`);
  }
  process.exit(1);
}

export interface ProtocolMapInternalOptions {
  queueId?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolMapInternal(opts: ProtocolMapInternalOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const events = loadQueueEvents();
  const target = opts.queueId
    ? events.find((e) => e.id === opts.queueId)
    : events[events.length - 1];
  if (!target) {
    console.error("No queue events found");
    process.exit(1);
  }
  const orgEvent = mapQueueEventToOrgEvent(target);
  if (opts.json) {
    console.log(JSON.stringify(orgEvent, null, 2));
    return;
  }
  console.log(`Queue ${target.id} → OrgEvent type: ${orgEvent.type}`);
}

export interface ProtocolEnvelopeValidateOptions {
  file: string;
}

export function runProtocolEnvelopeValidate(opts: ProtocolEnvelopeValidateOptions): void {
  const result = validateProtocolFile(opts.file, "envelope");
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log("✓ EventEnvelope valid");
}

export interface ProtocolNoticeProposeOptions {
  peer: string;
  operator: string;
  type?: string;
  contract?: string;
  correlationEvent?: string;
  invoice?: string;
  brokerInstruction?: string;
  amount?: number;
  currency?: string;
  stakeholder?: string;
  message?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolNoticePropose(opts: ProtocolNoticeProposeOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const txType = opts.type ?? "contract.execution.notice";
  try {
    const notice = proposeInterOrgWire({
      peerId: opts.peer,
      transactionType: txType as Parameters<typeof proposeInterOrgWire>[0]["transactionType"],
      proposedBy: opts.operator,
      contractId: opts.contract,
      correlationEventId: opts.correlationEvent,
      invoiceId: opts.invoice,
      brokerInstruction: opts.brokerInstruction,
      stakeholderId: opts.stakeholder,
      amount:
        opts.amount != null
          ? { value: opts.amount, currency: opts.currency ?? "JPY" }
          : undefined,
      message: opts.message,
    });
    if (opts.json) {
      console.log(JSON.stringify(notice, null, 2));
      return;
    }
    console.log(`✓ ${notice.notice_id} pending approval`);
    console.log(`  type: ${notice.transaction_type} · peer: ${notice.peer_id}`);
    if (notice.contract_id) console.log(`  contract: ${notice.contract_id}`);
    if (notice.correlation_event_id) console.log(`  correlation: ${notice.correlation_event_id}`);
    console.log(`  operator: ${notice.proposed_by}`);
    console.log(`  Next: steward protocol notice approve --id ${notice.notice_id} --approver <CEO>`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface ProtocolNoticeListOptions {
  status?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolNoticeList(opts: ProtocolNoticeListOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const rows = listPendingNotices(
    opts.status ? { status: opts.status as "pending_approval" } : undefined
  );
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("No notices.");
    return;
  }
  console.log("| id | status | type | peer | proposed_by |");
  console.log("|----|--------|------|------|-------------|");
  for (const n of rows) {
    console.log(
      `| ${n.notice_id} | ${n.status} | ${n.transaction_type} | ${n.peer_id} | ${n.proposed_by} |`
    );
  }
}

export interface ProtocolNoticeApproveOptions {
  id: string;
  approver: string;
  coApprover?: string;
  operator?: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolNoticeApprove(opts: ProtocolNoticeApproveOptions): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  try {
    const result = approveInterOrgNotice({
      noticeId: opts.id,
      approverId: opts.approver,
      coApproverId: opts.coApprover,
      operatorId: opts.operator,
    });
    const delivery = await deliverProtocolEnvelopeWithRelay(
      result.transmission.envelope,
      result.notice.peer_id
    );
    const { maybeRegisterWitnessAfterWire, formatWitnessFanOutSummary } = await import(
      "../lib/protocol/witness-hook.js"
    );
    const witness = await maybeRegisterWitnessAfterWire(result.transmission.envelope, "sent");
    const witnessSummary = formatWitnessFanOutSummary(witness);
    const wireGovernanceWitness =
      witness && result.notice.approval_tier
        ? evaluateWitnessWireGovernancePolicy({
            tier: result.notice.approval_tier,
            quorum: witness.quorum,
          })
        : undefined;
    const wireGovernanceSummary = wireGovernanceWitness
      ? formatWitnessWireGovernancePolicySummary(wireGovernanceWitness)
      : undefined;
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ...result,
            delivery,
            witness,
            wire_governance_witness: wireGovernanceWitness,
            reg004_witness: wireGovernanceWitness,
          },
          null,
          2
        )
      );
      return;
    }
    console.log(`✓ transmitted ${result.transmission.transaction.transaction_id}`);
    console.log(`  notice: ${result.notice.notice_id} · approver: ${opts.approver}`);
    console.log(`  tier: ${result.notice.approval_tier ?? "—"} · event_id: ${result.transmission.envelope.event_id}`);
    if (result.transmission.outboxPath) {
      console.log(`  outbox: ${result.transmission.outboxPath}`);
    }
    if (delivery.delivered) {
      console.log(`  delivered: ${delivery.reason} (HTTP ${delivery.httpStatus})`);
    } else if (delivery.queued) {
      console.log(`  deliver: queued (${delivery.reason}) — run protocol deliver flush-pending`);
    } else {
      console.log(`  deliver: skipped (${delivery.reason})`);
    }
    if (witnessSummary) {
      console.log(`  ${witnessSummary}`);
    }
    if (wireGovernanceSummary) {
      console.log(`  ${wireGovernanceSummary}`);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface ProtocolNoticeRejectOptions {
  id: string;
  approver: string;
  reason?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolNoticeReject(opts: ProtocolNoticeRejectOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  try {
    const notice = rejectInterOrgNotice({
      noticeId: opts.id,
      approverId: opts.approver,
      reason: opts.reason,
    });
    if (opts.json) {
      console.log(JSON.stringify(notice, null, 2));
      return;
    }
    console.log(`✓ rejected ${notice.notice_id}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export interface ProtocolNoticeShowOptions {
  id: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolNoticeShow(opts: ProtocolNoticeShowOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const notice = findPendingNotice(opts.id);
  if (!notice) {
    console.error(`Notice ${opts.id} not found`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(notice, null, 2));
    return;
  }
  console.log(`# ${notice.notice_id} · ${notice.status}`);
  console.log(`type: ${notice.transaction_type} · peer: ${notice.peer_id}`);
  if (notice.contract_id) console.log(`contract: ${notice.contract_id}`);
  if (notice.correlation_event_id) console.log(`correlation: ${notice.correlation_event_id}`);
  console.log(`proposed_by: ${notice.proposed_by} · ${notice.proposed_at.slice(0, 19)}`);
  if (notice.approver_id) console.log(`approver: ${notice.approver_id}`);
  if (notice.message) console.log(`message: ${notice.message}`);
  if (notice.transaction_id) console.log(`transaction_id: ${notice.transaction_id}`);
}

export interface ProtocolSigningExportOptions {
  tenant?: string;
  json?: boolean;
}

export function runProtocolSigningExportPublic(opts: ProtocolSigningExportOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  ensureProtocolSigningKey();
  const publicKey = exportProtocolPublicKeyBase64();
  if (!publicKey) {
    console.error("No signing key — run notice approve once or ensure data/protocol/signing-key.pem");
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify({ protocol_public_key: publicKey }, null, 2));
    return;
  }
  console.log(publicKey);
}

export interface ProtocolDeliverOptions {
  peer: string;
  file: string;
  tenant?: string;
}

export async function runProtocolDeliver(opts: ProtocolDeliverOptions): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  const envelope = JSON.parse(readFileSync(opts.file, "utf-8"));
  const parsed = eventEnvelopeSchema.parse(envelope);
  const delivery = await deliverProtocolEnvelopeWithRelay(parsed, opts.peer);
  if (!delivery.delivered && !delivery.queued) {
    console.error(`Deliver failed: ${delivery.reason}`);
    process.exit(1);
  }
  if (delivery.delivered) {
    console.log(`✓ delivered to ${opts.peer} · HTTP ${delivery.httpStatus}`);
  } else {
    console.log(`✓ queued for ${opts.peer} (${delivery.reason})`);
  }
}

export interface ProtocolDeliverFlushPendingOptions {
  tenant?: string;
  json?: boolean;
}

export async function runProtocolDeliverFlushPending(
  opts: ProtocolDeliverFlushPendingOptions
): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  const flushed = await flushWirePending();
  if (opts.json) {
    console.log(JSON.stringify({ flushed }, null, 2));
    return;
  }
  console.log(`✓ flushed ${flushed} pending wire delivery(ies)`);
}

export interface ProtocolNoticeDraftOptions extends ProtocolNoticeProposeOptions {
  /** Secretary default operator label */
  operator?: string;
}

export function runProtocolNoticeDraft(opts: ProtocolNoticeDraftOptions): void {
  runProtocolNoticePropose({
    ...opts,
    operator: opts.operator ?? "秘書オペレータ",
  });
}

export interface ProtocolApproversListOptions {
  tenant?: string;
  json?: boolean;
}

export function runProtocolApproversList(opts: ProtocolApproversListOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const approvers = loadAuthorizedApprovers();
  if (opts.json) {
    console.log(JSON.stringify(approvers, null, 2));
    return;
  }
  if (approvers.length === 0) {
    console.log("No authorized approvers in company.yaml (directors / representative).");
    return;
  }
  console.log("Authorized approvers (inter-org wire):");
  for (const a of approvers) console.log(`  · ${a}`);
}

export interface ProtocolWitnessRegisterOptions {
  eventId: string;
  side: "sent" | "received";
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessRegister(opts: ProtocolWitnessRegisterOptions): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  const { findEnvelopeFileForWitness } = await import("../lib/protocol/witness-envelope.js");
  const { registerWitnessAttestationFanOut } = await import("../lib/protocol/witness-client.js");
  const envelope = findEnvelopeFileForWitness(opts.eventId);
  if (!envelope) {
    console.error(`Envelope not found for event_id ${opts.eventId}`);
    process.exit(1);
  }
  const result = await registerWitnessAttestationFanOut({ envelope, side: opts.side });
  if (!result) {
    console.error("Witness pool disabled or empty");
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`witness fan-out: ${result.succeeded.length}/${result.succeeded.length + result.failed.length} hubs`);
  console.log(`quorum: ${result.quorum.satisfied ? "satisfied" : "NOT satisfied"} (${result.quorum.matched}/${result.quorum.required})`);
}

export interface ProtocolWitnessFlushPendingOptions {
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessFlushPending(opts: ProtocolWitnessFlushPendingOptions): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  const { flushWitnessPending } = await import("../lib/protocol/witness-client.js");
  const flushed = await flushWitnessPending();
  if (opts.json) {
    console.log(JSON.stringify({ flushed }, null, 2));
    return;
  }
  console.log(`✓ flushed ${flushed} pending witness attestation(s)`);
}

export interface ProtocolWitnessVerifyOptions {
  eventId: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessVerify(opts: ProtocolWitnessVerifyOptions): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  const { verifyCachedReceiptsForEvent, fetchReceiptsFromPool } = await import("../lib/protocol/witness-client.js");
  await fetchReceiptsFromPool(opts.eventId);
  const result = verifyCachedReceiptsForEvent(opts.eventId);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`receipts: ${result.receipts.length} · quorum: ${result.quorum.satisfied ? "ok" : "FAIL"}`);
  for (const issue of result.issues) console.log(`  ! ${issue}`);
  if (!result.quorum.satisfied) process.exit(1);
}

export interface ProtocolWitnessPoolStatusOptions {
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessPoolStatus(opts: ProtocolWitnessPoolStatusOptions): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  const { loadWitnessPoolConfig } = await import("../lib/protocol/witness-pool.js");
  const { checkWitnessPoolHealth } = await import("../lib/protocol/witness-client.js");
  const pool = loadWitnessPoolConfig();
  const health = await checkWitnessPoolHealth(pool);
  if (opts.json) {
    console.log(JSON.stringify({ pool, health }, null, 2));
    return;
  }
  console.log(`witness pool: enabled=${pool.enabled} · quorum=${pool.quorum.mode} · hubs=${pool.hubs.length}`);
  for (const h of health) {
    console.log(`  · ${h.hub_id}: ${h.ok ? "ok" : "DOWN"} (${h.url})`);
  }
}

export interface ProtocolWitnessReconcileOptions {
  peer: string;
  since?: string;
  eventId?: string;
  crossHub?: boolean;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessReconcile(
  opts: ProtocolWitnessReconcileOptions
): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  const { reconcileWitnessWithPeer, reconcileCrossHub } = await import("../lib/protocol/witness-reconcile.js");

  if (opts.crossHub) {
    const cross = await reconcileCrossHub({ since: opts.since, eventId: opts.eventId });
    const peer = await reconcileWitnessWithPeer({
      peerId: opts.peer,
      since: opts.since,
      eventId: opts.eventId,
    });
    const result = { peer, cross_hub: cross };
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`reconcile peer ${peer.peer_id}: checked ${peer.checked} · cross-hub ${cross.checked}`);
    for (const alert of [...peer.alerts, ...cross.alerts]) {
      console.log(`  [${alert.severity}] ${alert.code}: ${alert.message}`);
    }
    const hasErrors = [...peer.alerts, ...cross.alerts].some((a) => a.severity === "error");
    if (hasErrors) process.exit(1);
    return;
  }

  const result = await reconcileWitnessWithPeer({
    peerId: opts.peer,
    since: opts.since,
    eventId: opts.eventId,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`reconcile peer ${result.peer_id}: checked ${result.checked} outbound tx(s)`);
  console.log(`  quorum ok: ${result.quorum_ok} · fail: ${result.quorum_fail}`);
  for (const alert of result.alerts) {
    console.log(`  [${alert.severity}] ${alert.code}: ${alert.message}`);
  }
  const hasErrors = result.alerts.some((a) => a.severity === "error");
  if (hasErrors) process.exit(1);
}

export interface ProtocolTrustedHubsListOptions {
  jurisdiction?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolTrustedHubsList(opts: ProtocolTrustedHubsListOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const jurisdiction = opts.jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  const entry = findTrustedHubsForJurisdiction(jurisdiction);
  if (opts.json) {
    console.log(JSON.stringify(entry ?? { jurisdiction, hubs: [] }, null, 2));
    return;
  }
  console.log(`trusted hubs (${jurisdiction}): ${entry?.hubs.length ?? 0}`);
  for (const h of entry?.hubs ?? []) {
    console.log(`  · ${h.hub_id}: ${h.hub_url}`);
  }
}

export interface ProtocolWitnessPoolInitTrustedOptions {
  jurisdiction?: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessPoolInitTrusted(
  opts: ProtocolWitnessPoolInitTrustedOptions
): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  const jurisdiction = opts.jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  const { initWitnessPoolFromTrusted } = await import("../lib/protocol/witness-pool-init.js");
  const result = await initWitnessPoolFromTrusted(jurisdiction);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ witness-pool.yaml initialized from trusted hubs (${jurisdiction})`);
  console.log(`  path: ${result.path} · hubs: ${result.hubs.length}`);
}
