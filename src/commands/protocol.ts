import { setTenantId, loadTenantConfig } from "../lib/tenant.js";
import { applyProtocolTenant } from "./protocol-helpers.js";
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
} from "../lib/wire/index.js";
import { loadAuthorizedApprovers } from "../lib/jurisdiction/wire-governance/index.js";
import {
  findTransaction,
  listTransactions,
} from "../lib/protocol/transactions.js";
import {
  recordProtocolTransaction,
} from "../lib/protocol/record-transaction.js";
import { validateProtocolState, validateProtocolFile } from "../lib/protocol/validate.js";
import { verifyProtocolAuditChain } from "../lib/protocol/audit-chain.js";
import {
  verifyAuditChainExternal,
  verifyDelegationProofExternal,
} from "../lib/protocol/external-verify.js";
import { mapQueueEventToOrgEvent } from "../lib/protocol/map-internal.js";
import { loadProtocolRegistry } from "../lib/protocol/registry.js";
import type { TransactionType } from "../../schemas/protocol/transaction-record.js";
import {
  normalizeTransactionType,
  transactionTypeSchema,
} from "../../schemas/protocol/transaction-record.js";
import { resolveJurisdictionApprovalPolicy } from "../lib/jurisdiction/wire-governance/index.js";
import { eventEnvelopeSchema } from "../../schemas/protocol/org-event.js";
import { loadQueueEvents } from "../lib/queue-db.js";
import { exportProtocolPublicKeyBase64, ensureProtocolSigningKey, rotateProtocolSigningKey } from "../lib/protocol/signing.js";
import {
  deliverProtocolEnvelope,
  deliverProtocolEnvelopeWithRelay,
  flushWirePending,
  pullDeliverFromPeerOutbox,
} from "../lib/protocol/transport.js";
import {
  formatNoticeTransmitConsole,
  transmitApprovedNotice,
} from "../lib/protocol/notice-transmit.js";
import {
  findTrustedHubsForJurisdiction,
  validateTrustedHubsRegistry,
} from "../lib/protocol/trusted-hubs.js";
import { listDiscoverablePeers, listPeerRegistrationSuggestions } from "../lib/protocol/peer-discovery.js";
import { deliverEnvelopeViaMesh } from "../lib/protocol/peer-mesh.js";
import {
  initWitnessTrustAuthority,
  publishWitnessTrustBundle,
} from "../lib/protocol/witness-trust.js";
import { getWitnessTrustBundlePath } from "../lib/protocol/paths.js";
import { evaluateTransactionSla } from "../lib/protocol/resilience-sla.js";
import {
  listActiveOperators,
  loadTrustedOperatorsRegistry,
  validateTrustedOperatorsRegistry,
  checkRevocationSla,
  revokeTrustedOperator,
  submitGovernanceRequest,
  decideGovernanceRequest,
} from "../lib/protocol/trusted-operators.js";
import { computeCommunityReadiness } from "../lib/protocol/community-readiness.js";
import { revokeWitnessHubCertificate } from "../lib/protocol/witness-trust.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProtocolDataDir } from "../lib/protocol/paths.js";
import { findPeer, registerPeer, nextPeerId, resolvePeerOutboxBaseUrl } from "../lib/protocol/peers.js";
import { readFileSync } from "node:fs";
import { orgIdentityDocumentSchema } from "../../schemas/protocol/identity-exchange.js";

export interface ProtocolValidateOptions {
  tenant?: string;
  json?: boolean;
  standalone?: boolean;
}

export function runProtocolValidate(opts: ProtocolValidateOptions): void {
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
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

export interface ProtocolPeerDiscoverOptions {
  jurisdiction?: string;
  tenant?: string;
  json?: boolean;
  suggest?: boolean;
}

export function runProtocolPeerDiscover(opts: ProtocolPeerDiscoverOptions): void {
  applyProtocolTenant(opts.tenant);
  const jurisdiction = opts.jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  if (opts.suggest) {
    const suggestions = listPeerRegistrationSuggestions(jurisdiction);
    if (opts.json) {
      console.log(JSON.stringify({ jurisdiction, count: suggestions.length, suggestions }, null, 2));
      return;
    }
    console.log(`Peer registration suggestions (${jurisdiction}): ${suggestions.length}`);
    for (const s of suggestions) {
      const id = s.entry.peer_id ?? s.entry.hub_id ?? "?";
      console.log(`  · ${id}: ${s.register_command}`);
    }
    return;
  }
  const entries = listDiscoverablePeers({ jurisdiction });
  if (opts.json) {
    console.log(JSON.stringify({ jurisdiction, count: entries.length, entries }, null, 2));
    return;
  }
  console.log(`Discoverable peers/hubs (${jurisdiction}): ${entries.length}`);
  for (const entry of entries) {
    const id = entry.peer_id ?? entry.hub_id ?? "?";
    console.log(
      `  · [${entry.source}] ${id} — ${entry.display_name} (${entry.registered ? "registered" : "catalog"})`
    );
  }
}

export interface ProtocolDelegationExportOptions {
  scope: string;
  granteeAgent: string;
  basisRef?: string;
  json?: boolean;
  tenant?: string;
}

export function runProtocolDelegationExport(opts: ProtocolDelegationExportOptions): void {
  applyProtocolTenant(opts.tenant);
  try {
    const basisRef =
      opts.basisRef ?? resolveJurisdictionApprovalPolicy().policy_ref;
    const proof = exportDelegationProof({
      scope: opts.scope,
      granteeAgent: opts.granteeAgent,
      basisRef,
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
  const result = verifyDelegationProofExternal(opts.file);
  if (!result.ok) {
    for (const issue of result.issues) {
      console.error(`${issue.code}: ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(`✓ Delegation proof valid · ${result.proof?.grant.grant_id ?? ""}`);
}

export interface ProtocolVerifyAuditChainOptions {
  chain?: string;
  envelopeDir?: string[];
  since?: string;
  requireEnvelopes?: boolean;
  tenant?: string;
  json?: boolean;
}

export function runProtocolVerifyAuditChain(opts: ProtocolVerifyAuditChainOptions): void {
  applyProtocolTenant(opts.tenant);
  runProtocolAuditVerify({
    since: opts.since,
    json: opts.json,
    tenant: opts.tenant,
    withEnvelopes: true,
    requireEnvelopes: opts.requireEnvelopes,
    chainPath: opts.chain,
    envelopeDir: opts.envelopeDir,
  });
}

export interface ProtocolVerifyDelegationOptions {
  file: string;
  json?: boolean;
}

export function runProtocolVerifyDelegation(opts: ProtocolVerifyDelegationOptions): void {
  const result = verifyDelegationProofExternal(opts.file);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.ok) {
    for (const issue of result.issues) {
      console.error(`${issue.code}: ${issue.message}`);
    }
    process.exit(1);
  }
  console.log(`✓ Delegation proof verified · ${result.proof?.grant.grant_id ?? ""}`);
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
  applyProtocolTenant(opts.tenant);
  const parsedType = transactionTypeSchema.safeParse(opts.type);
  if (!parsedType.success) {
    console.error(`Invalid transaction type: ${opts.type}`);
    process.exit(1);
  }
  const transactionType = parsedType.data;

  if (transactionType === "steward.contract.execution.notice") {
    console.error(
      "Use `steward protocol notice propose` + `notice approve` for execution notices (operator + approver required)"
    );
    process.exit(1);
  }

  const outboundWireTypes: TransactionType[] = [
    "steward.contract.executed",
    "steward.invoice.issued",
    "steward.payment.instructed",
    "steward.obligation.acknowledged",
  ];
  if (outboundWireTypes.includes(transactionType)) {
    const legacy = opts.type;
    console.error(
      `Use \`steward protocol notice propose --type ${legacy}\` + \`notice approve\` for outbound wire`
    );
    process.exit(1);
  }

  try {
    const result = recordProtocolTransaction({
      transactionType,
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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
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

export function runProtocolAuditVerify(opts: ProtocolAuditVerifyOptions & {
  withEnvelopes?: boolean;
  requireEnvelopes?: boolean;
  chainPath?: string;
  envelopeDir?: string[];
}): void {
  applyProtocolTenant(opts.tenant);

  if (opts.withEnvelopes || opts.requireEnvelopes || opts.chainPath || opts.envelopeDir?.length) {
    const result = verifyAuditChainExternal({
      chainPath: opts.chainPath,
      envelopeDirs: opts.envelopeDir,
      since: opts.since,
      requireEnvelopes: opts.requireEnvelopes,
    });
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result.ok) {
      console.log(
        `✓ Audit chain OK (${result.checked} records · ${result.envelopesLoaded} envelope(s))`
      );
      for (const warning of result.warnings) {
        console.log(`  warn: ${warning.message}`);
      }
      return;
    }
    console.error("✗ Audit chain issues:");
    for (const issue of result.issues) {
      console.error(`  ${issue.audit_id}: ${issue.message}`);
    }
    for (const warning of result.warnings) {
      console.error(`  warn: ${warning.message}`);
    }
    process.exit(1);
  }

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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
  try {
    const result = approveInterOrgNotice({
      noticeId: opts.id,
      approverId: opts.approver,
      coApproverId: opts.coApprover,
      operatorId: opts.operator,
    });
    const transmit = await transmitApprovedNotice(result);

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ...result,
            pool_bind: transmit.poolBind,
            delivery: transmit.delivery,
            witness: transmit.witness,
            wire_governance_witness: transmit.wireGovernanceWitness,
          },
          null,
          2
        )
      );
      return;
    }
    for (const line of formatNoticeTransmitConsole(result, transmit, opts.approver)) {
      console.log(line);
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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
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

export interface ProtocolSigningRotateOptions {
  tenant?: string;
  json?: boolean;
}

export function runProtocolSigningRotate(opts: ProtocolSigningRotateOptions): void {
  applyProtocolTenant(opts.tenant);
  const result = rotateProtocolSigningKey();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("✓ Protocol signing key rotated");
  console.log(`  protocol_public_key: ${result.publicKey}`);
  if (result.backupPath) {
    console.log(`  backup: ${result.backupPath}`);
  }
  console.log("  Re-share public key with peers after rotation.");
}

export interface ProtocolDeliverOptions {
  peer: string;
  file: string;
  tenant?: string;
}

export async function runProtocolDeliver(opts: ProtocolDeliverOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
  const flushed = await flushWirePending();
  if (opts.json) {
    console.log(JSON.stringify({ flushed }, null, 2));
    return;
  }
  console.log(`✓ flushed ${flushed} pending wire delivery(ies)`);
}

export interface ProtocolDeliverPullOptions {
  peer: string;
  eventId: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolDeliverPull(opts: ProtocolDeliverPullOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const peer = findPeer(opts.peer);
  if (!peer) {
    console.error(`Peer ${opts.peer} not found`);
    process.exit(1);
  }
  const outboxBase = resolvePeerOutboxBaseUrl(peer);
  if (!outboxBase) {
    console.error(`Peer ${opts.peer} has no outbox base URL (add pull endpoint or webhook URL)`);
    process.exit(1);
  }
  const result = await pullDeliverFromPeerOutbox(outboxBase, opts.eventId);
  if (!result.delivered) {
    console.error(`Pull failed: ${result.reason}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ pulled envelope ${opts.eventId} from ${opts.peer}`);
  if (result.inboxPath) {
    console.log(`  inbox: ${result.inboxPath}`);
  }
}

export interface ProtocolMeshDeliverOptions {
  peer: string;
  file: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolMeshDeliver(opts: ProtocolMeshDeliverOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const envelope = JSON.parse(readFileSync(opts.file, "utf-8"));
  const parsed = eventEnvelopeSchema.parse(envelope);
  const result = await deliverEnvelopeViaMesh(parsed, opts.peer);
  if (!result.delivered && !result.queued) {
    console.error(`Mesh deliver failed: ${result.reason}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ mesh delivered to ${opts.peer} via ${result.hops?.join(" → ") ?? opts.peer}`);
  if (result.queued) {
    console.log(`  queued: ${result.reason}`);
  }
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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
  const { findEnvelopeFileForWitness } = await import("../lib/protocol/witness-client.js");
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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
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
  applyProtocolTenant(opts.tenant);
  const { reconcileWitnessWithPeerAndPersist, reconcileCrossHub } = await import(
    "../lib/protocol/witness-reconcile.js"
  );
  const { persistAndEscalateAlerts } = await import("../lib/protocol/reconcile-alerts-store.js");

  if (opts.crossHub) {
    const cross = await reconcileCrossHub({ since: opts.since, eventId: opts.eventId });
    const peer = await reconcileWitnessWithPeerAndPersist({
      peerId: opts.peer,
      since: opts.since,
      eventId: opts.eventId,
      remoteLedger: true,
    });
    persistAndEscalateAlerts(cross.alerts);
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

  const result = await reconcileWitnessWithPeerAndPersist({
    peerId: opts.peer,
    since: opts.since,
    eventId: opts.eventId,
    remoteLedger: true,
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
  applyProtocolTenant(opts.tenant);
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

export interface ProtocolTrustedHubsValidateOptions {
  tenant?: string;
  json?: boolean;
}

export function runProtocolTrustedHubsValidate(opts: ProtocolTrustedHubsValidateOptions): void {
  applyProtocolTenant(opts.tenant);
  const result = validateTrustedHubsRegistry();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    console.log("✓ Trusted hubs registry OK");
    for (const w of result.warnings) {
      console.log(`  [warn] ${w.code}: ${w.message}`);
    }
    return;
  }
  console.error("✗ Trusted hubs validation failed:");
  for (const issue of result.issues) {
    console.error(`  [${issue.code}] ${issue.message}`);
  }
  process.exit(1);
}

export interface ProtocolWitnessPoolInitTrustedOptions {
  jurisdiction?: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessPoolInitTrusted(
  opts: ProtocolWitnessPoolInitTrustedOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
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

export interface ProtocolRelayOnceOptions {
  tenant?: string;
  json?: boolean;
  noReconcile?: boolean;
}

export async function runProtocolRelayOnce(opts: ProtocolRelayOnceOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { runRelayCycle } = await import("../lib/protocol/relay-worker.js");
  const result = await runRelayCycle({ reconcile: !opts.noReconcile });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `✓ relay cycle · wire +${result.wire_flushed} witness +${result.witness_flushed} · pending w=${result.wire_pending} v=${result.witness_pending} · sla_fail=${result.sla_failures}`
  );
}

export interface ProtocolRelayRunOptions {
  tenant?: string;
  intervalSec?: number;
  maxCycles?: number;
  noReconcile?: boolean;
}

export async function runProtocolRelayRun(opts: ProtocolRelayRunOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { runRelayDaemon } = await import("../lib/protocol/relay-worker.js");
  await runRelayDaemon({
    intervalMs: (opts.intervalSec ?? 30) * 1000,
    maxCycles: opts.maxCycles,
    reconcile: !opts.noReconcile,
  });
}

export interface ProtocolRelayStatusOptions {
  tenant?: string;
  json?: boolean;
}

export async function runProtocolRelayStatus(opts: ProtocolRelayStatusOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { loadRelayState } = await import("../lib/protocol/relay-worker.js");
  const { listWirePending } = await import("../lib/protocol/wire-queue.js");
  const { listWitnessPending } = await import("../lib/protocol/witness-queue.js");
  const state = loadRelayState();
  const body = {
    cycles: state.cycles,
    last_run_at: state.last_run_at,
    last_metrics: state.last_metrics,
    wire_pending: listWirePending().length,
    witness_pending: listWitnessPending().length,
  };
  if (opts.json) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  console.log(
    `relay status · cycles=${body.cycles} · wire_pending=${body.wire_pending} · witness_pending=${body.witness_pending}`
  );
  if (body.last_run_at) console.log(`  last run: ${body.last_run_at}`);
}

export interface ProtocolWitnessTrustInitAuthorityOptions {
  authorityId: string;
  orgName: string;
  jurisdiction?: string;
  orgUri?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolWitnessTrustInitAuthority(
  opts: ProtocolWitnessTrustInitAuthorityOptions
): void {
  applyProtocolTenant(opts.tenant);
  const jurisdiction = opts.jurisdiction ?? loadTenantConfig().jurisdiction ?? "JP";
  const authority = initWitnessTrustAuthority({
    authorityId: opts.authorityId,
    orgName: opts.orgName,
    jurisdiction,
    orgUri: opts.orgUri,
  });
  if (opts.json) {
    console.log(JSON.stringify(authority, null, 2));
    return;
  }
  console.log(`✓ witness trust authority ${authority.authority_id} · ${authority.org_name}`);
}

export interface ProtocolWitnessTrustCertifyOptions {
  hubId: string;
  hubUrl: string;
  hubPublicKey?: string;
  expiresAt?: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessTrustCertify(
  opts: ProtocolWitnessTrustCertifyOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { certifyWitnessHub, addCertificateToBundle, exportWitnessTrustAuthorityPublicKey } =
    await import("../lib/protocol/witness-trust.js");
  let hubPublicKey = opts.hubPublicKey;
  if (!hubPublicKey) {
    const base = opts.hubUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/hub/v1/public-key`);
    if (!res.ok) {
      console.error(`Failed to fetch hub public key: HTTP ${res.status}`);
      process.exit(1);
    }
    const body = (await res.json()) as { public_key?: string };
    hubPublicKey = body.public_key;
  }
  if (!hubPublicKey) {
    console.error("hub public key required (--hub-public-key or fetch from hub)");
    process.exit(1);
  }
  const cert = certifyWitnessHub({
    hubId: opts.hubId,
    hubUrl: opts.hubUrl,
    hubPublicKey,
    expiresAt: opts.expiresAt,
  });
  const bundle = addCertificateToBundle(cert);
  if (opts.json) {
    console.log(JSON.stringify({ cert, bundle_certificates: bundle.certificates.length }, null, 2));
    return;
  }
  console.log(`✓ certified hub ${cert.hub_id} · cert_id=${cert.cert_id}`);
  console.log(`  authority pubkey: ${exportWitnessTrustAuthorityPublicKey().slice(0, 16)}…`);
}

export interface ProtocolWitnessTrustPublishOptions {
  tenant?: string;
  json?: boolean;
}

export function runProtocolWitnessTrustPublish(opts: ProtocolWitnessTrustPublishOptions): void {
  applyProtocolTenant(opts.tenant);
  const bundle = publishWitnessTrustBundle();
  if (opts.json) {
    console.log(JSON.stringify(bundle, null, 2));
    return;
  }
  console.log(`✓ trust bundle published · ${bundle.certificates.length} certificate(s)`);
  console.log(`  path: ${getWitnessTrustBundlePath()}`);
}

export interface ProtocolWitnessTrustVerifyOptions {
  bundleUrl?: string;
  bundleFile?: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessTrustVerify(
  opts: ProtocolWitnessTrustVerifyOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { fetchWitnessTrustBundle, verifyWitnessTrustBundle, loadWitnessTrustBundle } =
    await import("../lib/protocol/witness-trust.js");
  const { readFileSync } = await import("node:fs");
  const { witnessTrustBundleSchema } = await import("../../schemas/protocol/witness-trust.js");
  let bundle;
  if (opts.bundleUrl) {
    bundle = await fetchWitnessTrustBundle(opts.bundleUrl);
  } else if (opts.bundleFile) {
    bundle = witnessTrustBundleSchema.parse(JSON.parse(readFileSync(opts.bundleFile, "utf-8")));
  } else {
    bundle = loadWitnessTrustBundle();
  }
  if (!bundle) {
    console.error("No trust bundle — use --bundle-url or --bundle-file");
    process.exit(1);
  }
  const result = verifyWitnessTrustBundle(bundle);
  if (opts.json) {
    console.log(JSON.stringify({ ...result, authority_id: bundle.authority.authority_id, certs: bundle.certificates.length }, null, 2));
    return;
  }
  if (result.ok) {
    console.log(`✓ trust bundle valid · authority=${bundle.authority.authority_id} · certs=${bundle.certificates.length}`);
  } else {
    console.error(`✗ trust bundle invalid:`);
    for (const issue of result.issues) console.error(`  · ${issue}`);
    process.exit(1);
  }
}

export interface ProtocolWitnessPoolInitFromTrustOptions {
  bundleUrl: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessPoolInitFromTrust(
  opts: ProtocolWitnessPoolInitFromTrustOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { initWitnessPoolFromTrustBundle } = await import("../lib/protocol/contract-witness-pool.js");
  const result = await initWitnessPoolFromTrustBundle(opts.bundleUrl);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ witness-pool.yaml from trust bundle · hubs: ${result.hubs.length}`);
}

export interface ProtocolWitnessPoolInitFromContractOptions {
  contract: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolWitnessPoolInitFromContract(
  opts: ProtocolWitnessPoolInitFromContractOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { initWitnessPoolFromContract } = await import("../lib/protocol/contract-witness-pool.js");
  const result = await initWitnessPoolFromContract(opts.contract);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ witness-pool.yaml from ${opts.contract} · sla=${result.sla} · hubs: ${result.hubs.length}`);
}

export interface ProtocolApiServeOptions {
  host?: string;
  port?: number;
  tenant?: string;
  tlsCert?: string;
  tlsKey?: string;
  tlsCa?: string;
  mtlsRequired?: boolean;
  mtlsAllowedOrg?: string[];
}

export async function runProtocolApiServe(opts: ProtocolApiServeOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { startProtocolApiServer } = await import("../lib/protocol/protocol-api-server.js");
  const { buildProtocolApiServerConfig } = await import("../lib/protocol/protocol-api-config.js");
  const config = buildProtocolApiServerConfig({
    host: opts.host,
    port: opts.port,
    tlsCert: opts.tlsCert,
    tlsKey: opts.tlsKey,
    tlsCa: opts.tlsCa,
    mtlsRequired: opts.mtlsRequired,
    mtlsAllowedOrgUris: opts.mtlsAllowedOrg,
  });
  const server = await startProtocolApiServer({ config });
  console.log(`✓ Protocol API ${server.url}`);
  if (config.tls) console.log("  TLS: enabled · trust bundle over HTTPS");
  if (config.mtls_required) {
    console.log(`  mTLS: required on relay/inbox/outbox · allowed: ${config.mtls_allowed_org_uris.join(", ") || "(any authorized client)"}`);
  }
  console.log("  GET /protocol/v1/trust/bundle · /inbox · /outbox · /ledger · /metrics · POST /protocol/v1/relay/enqueue");
  await new Promise<void>(() => {
    /* keep alive until SIGINT */
  });
}

export interface ProtocolSlaCheckOptions {
  eventId?: string;
  tier?: "bronze" | "silver" | "gold";
  tenant?: string;
  json?: boolean;
}

export function runProtocolSlaCheck(opts: ProtocolSlaCheckOptions): void {
  applyProtocolTenant(opts.tenant);
  const tier = opts.tier ?? "silver";
  if (opts.eventId) {
    const evaluation = evaluateTransactionSla(opts.eventId, tier);
    if (opts.json) {
      console.log(JSON.stringify(evaluation, null, 2));
      return;
    }
    console.log(`SLA ${tier} · ${evaluation.event_id}: ${evaluation.satisfied ? "OK" : "FAIL"} (${evaluation.state})`);
    if (evaluation.missing.length) console.log(`  missing: ${evaluation.missing.join(", ")}`);
    if (!evaluation.satisfied) process.exit(1);
    return;
  }
  const evaluations = listTransactions()
    .filter((t) => t.direction === "outbound")
    .map((t) => evaluateTransactionSla(t.event_id, tier));
  if (opts.json) {
    console.log(JSON.stringify(evaluations, null, 2));
    return;
  }
  const failed = evaluations.filter((e) => !e.satisfied);
  console.log(`SLA ${tier}: ${evaluations.length - failed.length}/${evaluations.length} satisfied`);
  for (const f of failed) {
    console.log(`  ✗ ${f.event_id} missing ${f.missing.join(", ")}`);
  }
  if (failed.length) process.exit(1);
}

export interface ProtocolCommunityOperatorsListOptions {
  jurisdiction?: string;
  json?: boolean;
}

export function runProtocolCommunityOperatorsList(opts: ProtocolCommunityOperatorsListOptions): void {
  const ops = opts.jurisdiction
    ? listActiveOperators(opts.jurisdiction)
    : loadTrustedOperatorsRegistry().operators;
  if (opts.json) {
    console.log(JSON.stringify(ops, null, 2));
    return;
  }
  console.log(`trusted operators: ${ops.length}`);
  for (const op of ops) {
    console.log(`  · ${op.operator_id} (${op.status}) · ${op.org_name} · hubs: ${op.hub_ids.join(", ")}`);
  }
}

export interface ProtocolCommunityOperatorsValidateOptions {
  json?: boolean;
}

export function runProtocolCommunityOperatorsValidate(opts: ProtocolCommunityOperatorsValidateOptions): void {
  const result = validateTrustedOperatorsRegistry();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    console.log("✓ Trusted operators registry OK");
    return;
  }
  for (const issue of result.issues) {
    console.error(`  [${issue.code}] ${issue.message}`);
  }
  process.exit(1);
}

export interface ProtocolCommunityCheckSlaOptions {
  json?: boolean;
}

export function runProtocolCommunityCheckSla(opts: ProtocolCommunityCheckSlaOptions): void {
  const result = checkRevocationSla();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  if (result.ok) {
    console.log("✓ Revocation SLA: no overdue revocations");
    return;
  }
  for (const o of result.overdue) {
    console.error(`  ✗ ${o.operator_id}: ${o.hours_since_revoke.toFixed(1)}h > SLA ${o.sla_hours}h`);
  }
  process.exit(1);
}

export interface ProtocolCommunityRevokeOptions {
  operatorId: string;
  reason?: string;
  json?: boolean;
}

export function runProtocolCommunityRevoke(opts: ProtocolCommunityRevokeOptions): void {
  const op = revokeTrustedOperator({ operatorId: opts.operatorId, reason: opts.reason });
  if (opts.json) {
    console.log(JSON.stringify(op, null, 2));
    return;
  }
  console.log(`✓ revoked operator ${op.operator_id} at ${op.revoked_at}`);
}

export interface ProtocolCommunityGovernanceSubmitOptions {
  operatorId: string;
  orgName: string;
  jurisdiction: string;
  hubIds: string[];
  requestedBy: string;
  json?: boolean;
}

export function runProtocolCommunityGovernanceSubmit(
  opts: ProtocolCommunityGovernanceSubmitOptions
): void {
  const req = submitGovernanceRequest({
    operatorId: opts.operatorId,
    orgName: opts.orgName,
    jurisdiction: opts.jurisdiction,
    hubIds: opts.hubIds,
    requestedBy: opts.requestedBy,
  });
  if (opts.json) {
    console.log(JSON.stringify(req, null, 2));
    return;
  }
  console.log(`✓ governance request ${req.request_id} · ${req.operator_id} pending`);
}

export interface ProtocolCommunityGovernanceDecideOptions {
  requestId: string;
  approve: boolean;
  decidedBy: string;
  note?: string;
  authorityId?: string;
  json?: boolean;
}

export function runProtocolCommunityGovernanceDecide(
  opts: ProtocolCommunityGovernanceDecideOptions
): void {
  const { request, operator } = decideGovernanceRequest({
    requestId: opts.requestId,
    approve: opts.approve,
    decidedBy: opts.decidedBy,
    note: opts.note,
    authorityId: opts.authorityId,
  });
  if (opts.json) {
    console.log(JSON.stringify({ request, operator }, null, 2));
    return;
  }
  console.log(`✓ governance ${request.status}: ${request.operator_id}`);
  if (operator) console.log(`  operator certified · hubs: ${operator.hub_ids.join(", ")}`);
}

export interface ProtocolCommunityReadinessOptions {
  json?: boolean;
}

export function runProtocolCommunityReadiness(opts: ProtocolCommunityReadinessOptions): void {
  const result = computeCommunityReadiness();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Community readiness (Steward-side): ${result.score}/80`);
  for (const check of result.checks) {
    console.log(`  ${check.ok ? "✓" : "✗"} ${check.id}: ${check.detail}`);
  }
}

export interface ProtocolWitnessTrustRevokeOptions {
  certId: string;
  hubId: string;
  reason?: string;
  operatorId?: string;
  tenant?: string;
  json?: boolean;
}

export function runProtocolWitnessTrustRevoke(opts: ProtocolWitnessTrustRevokeOptions): void {
  applyProtocolTenant(opts.tenant);
  const entry = revokeWitnessHubCertificate({
    certId: opts.certId,
    hubId: opts.hubId,
    reason: opts.reason,
    operatorId: opts.operatorId,
  });
  if (opts.json) {
    console.log(JSON.stringify(entry, null, 2));
    return;
  }
  console.log(`✓ revoked hub cert ${opts.hubId} · bundle republished`);
}

export interface ProtocolTlsRotateOptions {
  tenant?: string;
  certPath?: string;
  keyPath?: string;
  json?: boolean;
}

export function runProtocolTlsRotate(opts: ProtocolTlsRotateOptions): void {
  applyProtocolTenant(opts.tenant);
  const tlsDir = join(getProtocolDataDir(), "tls");
  mkdirSync(tlsDir, { recursive: true });
  const certPath = opts.certPath ?? join(tlsDir, "server.crt");
  const keyPath = opts.keyPath ?? join(tlsDir, "server.key");
  const meta = {
    rotated_at: new Date().toISOString(),
    cert_path: certPath,
    key_path: keyPath,
    checklist: [
      "Issue new X.509 cert (ACME / internal CA) to cert_path",
      "Update protocol-api-client.yaml tls cert_path/key_path/ca_path",
      "Restart protocol api-serve and relay daemon",
      "Verify GET /protocol/v1/metrics and mTLS peers",
    ],
    previous_cert_exists: existsSync(certPath),
    previous_key_exists: existsSync(keyPath),
  };
  writeFileSync(join(tlsDir, "rotation-meta.json"), JSON.stringify(meta, null, 2));
  if (opts.json) {
    console.log(JSON.stringify(meta, null, 2));
    return;
  }
  console.log(`✓ TLS rotation checklist written · ${join(tlsDir, "rotation-meta.json")}`);
  for (const step of meta.checklist) console.log(`  · ${step}`);
}
