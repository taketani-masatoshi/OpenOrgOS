import type { Command } from "commander";
import {
  runProtocolValidate,
  runProtocolOutboxApplyPermissions,
  runProtocolOutboxCheckPermissions,
  runProtocolAuditVerify,
  runProtocolVerifyAuditChain,
} from "../../../commands/protocol/validate.js";
import {
  runProtocolIdentityExport,
  runProtocolIdentityValidate,
  runProtocolDelegationExport,
  runProtocolDelegationValidate,
  runProtocolSigningExportPublic,
  runProtocolSigningRotate,
  runProtocolVerifyDelegation,
} from "../../../commands/protocol/identity.js";
import {
  runProtocolPeerRegister,
  runProtocolPeersMigrateLegacy,
  runProtocolPeerDiscover,
} from "../../../commands/protocol/peer.js";
import {
  runProtocolTransactionRecord,
  runProtocolTransactionList,
  runProtocolTransactionShow,
  runProtocolTransactionPruneOrphans,
} from "../../../commands/protocol/transaction.js";
import {
  runProtocolNoticePropose,
  runProtocolNoticeList,
  runProtocolNoticeApprove,
  runProtocolNoticeReject,
  runProtocolNoticeShow,
  runProtocolNoticeDraft,
  runProtocolApproversList,
} from "../../../commands/protocol/notice.js";
import {
  runProtocolDeliver,
  runProtocolDeliverFlushPending,
  runProtocolDeliverPull,
  runProtocolMailWireScan,
  runProtocolMeshDeliver,
  runProtocolDeliverStatus,
} from "../../../commands/protocol/delivery.js";
import {
  runProtocolWitnessRegister,
  runProtocolWitnessFlushPending,
  runProtocolWitnessVerify,
  runProtocolWitnessCacheMissing,
  runProtocolWitnessReconcile,
  runProtocolWitnessPoolStatus,
  runProtocolTrustedHubsList,
  runProtocolTrustedHubsValidate,
  runProtocolWitnessPoolInitTrusted,
  runProtocolWitnessTrustInitAuthority,
  runProtocolWitnessTrustCertify,
  runProtocolWitnessTrustPublish,
  runProtocolWitnessTrustVerify,
  runProtocolWitnessPoolInitFromTrust,
  runProtocolWitnessPoolInitFromContract,
  runProtocolWitnessTrustRevoke,
  runProtocolTrustedHubsSyncKeys,
} from "../../../commands/protocol/witness.js";
import {
  runProtocolTrustRegistryValidate,
  runProtocolTrustRegistryList,
  runProtocolTrustRegistryResolve,
  runProtocolTrustRegistrySyncKeys,
  runProtocolTrustRegistryPinLocal,
  runProtocolTrustRegistrySubmit,
  runProtocolTrustRegistryDecide,
  runProtocolTrustRegistryPending,
} from "../../../commands/protocol/trust.js";
import {
  runProtocolCommunityOperatorsList,
  runProtocolCommunityOperatorsValidate,
  runProtocolCommunityCheckSla,
  runProtocolCommunityRevoke,
  runProtocolCommunityGovernanceSubmit,
  runProtocolCommunityGovernanceDecide,
  runProtocolCommunityReadiness,
  runProtocolCommunityExport,
} from "../../../commands/protocol/community.js";
import {
  runProtocolTlsRotate,
  runProtocolTlsInitProposal3,
  runProtocolTlsVerify,
} from "../../../commands/protocol/tls.js";
import {
  runProtocolGovGatewayValidate,
  runProtocolGovGatewayEncode,
  runProtocolGovGatewayDecode,
  runProtocolGovGatewayHealth,
  runProtocolGovGatewaySandboxInit,
} from "../../../commands/protocol/gov-gateway.js";
import {
  runProtocolRelayOnce,
  runProtocolRelayRun,
  runProtocolRelayStatus,
  runProtocolSlaCheck,
} from "../../../commands/protocol/relay.js";
import { runProtocolApiServe } from "../../../commands/protocol/api.js";

/** Historical `orgos protocol` root — prefer `orgos wire`. */
export function registerLegacyProtocolCommands(program: Command): void {
  const protocolCmd = program
    .command("protocol")
    .description("Compatibility alias for historical protocol CLI; prefer `orgos wire`");
  protocolCmd
    .command("validate")
    .description("Validate protocol registry · peers · transactions · audit chain")
    .option("--tenant <id>", "Tenant id")
    .option("--standalone", "Peer-less OrgOS mode (no peers · witness disabled)")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolValidate({ tenant: opts.tenant, json: opts.json, standalone: opts.standalone })
    );

  const protocolOutboxCmd = protocolCmd.command("outbox").description("Protocol outbox directory hardening");
  protocolOutboxCmd
    .command("apply-permissions")
    .description("Set outbox/inbox 750 · protocol data 700 · envelope files 640 (deploy template)")
    .option("--tenant <id>", "Tenant id")
    .option("--user <name>", "Owner user for chown (requires root)")
    .option("--group <name>", "Owner group for chown")
    .option("--dry-run", "Print paths only")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolOutboxApplyPermissions({
        tenant: opts.tenant,
        user: opts.user,
        group: opts.group,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );
  protocolOutboxCmd
    .command("check-permissions")
    .description("Verify outbox/inbox are not world-writable (production hardening)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolOutboxCheckPermissions({ tenant: opts.tenant, json: opts.json })
    );

  const protocolIdentityCmd = protocolCmd.command("identity").description("Identity exchange");
  protocolIdentityCmd
    .command("export")
    .description("Export OrgIdentity as EventEnvelope")
    .option("--peer <id>", "Destination peer id")
    .option("--stakeholder <id>", "Link stakeholder_id (STK-*)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolIdentityExport({
        peer: opts.peer,
        stakeholder: opts.stakeholder,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolIdentityCmd
    .command("validate")
    .description("Validate identity envelope or document JSON file")
    .requiredOption("--file <path>", "JSON file")
    .action((opts) => runProtocolIdentityValidate({ file: opts.file }));

  const protocolPeerCmd = protocolCmd.command("peer").description("External org peer registry");
  protocolPeerCmd
    .command("register")
    .description("Register peer in data/protocol/peers.yaml")
    .requiredOption("--name <text>", "Display name")
    .requiredOption("--jurisdiction <code>", "Jurisdiction (JP | HK | …)")
    .option("--stakeholder <id>", "STK-* link")
    .option("--peer-id <id>", "Override peer id (PEER-NNN)")
    .option("--org-uri <uri>", "steward://tenant/...")
    .option("--public-key <b64>", "Base64 SPKI public key")
    .option("--identity-file <path>", "Identity JSON with protocol_public_key")
    .option("--webhook-url <url>", "Peer inbound webhook URL")
    .option("--tenant <id>", "Tenant id")
    .action((opts) =>
      runProtocolPeerRegister({
        name: opts.name,
        jurisdiction: opts.jurisdiction,
        stakeholder: opts.stakeholder,
        peerId: opts.peerId,
        orgUri: opts.orgUri,
        publicKey: opts.publicKey,
        identityFile: opts.identityFile,
        webhookUrl: opts.webhookUrl,
        tenant: opts.tenant,
      })
    );
  protocolPeerCmd
    .command("discover")
    .description("List registered peers and jurisdiction trusted-hub catalog entries")
    .option("--jurisdiction <code>", "ISO jurisdiction code")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .option("--suggest", "Print suggested peer register commands for unregistered entries")
    .action((opts) =>
      runProtocolPeerDiscover({
        jurisdiction: opts.jurisdiction,
        tenant: opts.tenant,
        json: opts.json,
        suggest: opts.suggest,
      })
    );

  const protocolPeersCmd = protocolCmd
    .command("peers")
    .description("Peer registry maintenance (legacy migration)");
  protocolPeersCmd
    .command("migrate-legacy")
    .description("Migrate inbound_webhook_url → inbound_endpoints (legacy_webhook or wire_v1)")
    .option("--tenant <id>", "Tenant id")
    .option("--apply", "Write peers.yaml (default: dry-run)")
    .option("--to-wire-url <url>", "Rewrite to wire_v1 at this Gateway URL")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolPeersMigrateLegacy({
        tenant: opts.tenant,
        apply: opts.apply,
        toWireUrl: opts.toWireUrl,
        json: opts.json,
      })
    );

  const protocolMeshCmd = protocolCmd.command("mesh").description("Multi-hop peer mesh delivery (FR-EM-07)");
  protocolMeshCmd
    .command("deliver")
    .description("Deliver envelope via configured mesh route (via chain)")
    .requiredOption("--peer <id>", "Final destination PEER-*")
    .requiredOption("--file <path>", "Envelope JSON file")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolMeshDeliver({
        peer: opts.peer,
        file: opts.file,
        tenant: opts.tenant,
        json: opts.json,
      })
    );

  const protocolDelegationCmd = protocolCmd.command("delegation").description("Authority delegation");
  protocolDelegationCmd
    .command("export")
    .description("Export DelegationProof as EventEnvelope")
    .requiredOption("--scope <scope>", "e.g. contract.sign")
    .requiredOption("--grantee-agent <id>", "Agent id (contract · finance · …)")
    .option("--basis-ref <ref>", "Policy basis (jurisdiction policy_ref, e.g. from wire-governance pack)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolDelegationExport({
        scope: opts.scope,
        granteeAgent: opts.granteeAgent,
        basisRef: opts.basisRef,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolDelegationCmd
    .command("validate")
    .description("Validate delegation proof JSON file")
    .requiredOption("--file <path>", "JSON file")
    .action((opts) => runProtocolDelegationValidate({ file: opts.file }));

  const protocolTxCmd = protocolCmd.command("transaction").description("Inter-org transaction ledger");
  protocolTxCmd
    .command("record")
    .description("Record inbound transaction (outbound requires notice approve)")
    .requiredOption("--type <type>", "obligation.acknowledged | invoice.issued | …")
    .requiredOption("--peer <id>", "Peer id (PEER-*)")
    .option("--contract <id>", "CTR-*")
    .option("--invoice <id>", "Invoice id")
    .option("--broker-instruction <path>", "Broker instruction scratch path id")
    .option("--amount <n>", "Amount", parseFloat)
    .option("--currency <code>", "Currency", "JPY")
    .option("--stakeholder <id>", "STK-*")
    .option("--notes <text>", "Notes")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolTransactionRecord({
        type: opts.type,
        peer: opts.peer,
        contract: opts.contract,
        invoice: opts.invoice,
        brokerInstruction: opts.brokerInstruction,
        amount: opts.amount,
        currency: opts.currency,
        stakeholder: opts.stakeholder,
        notes: opts.notes,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolTxCmd
    .command("list")
    .description("List transactions")
    .option("--peer <id>", "Filter by peer")
    .option("--since <date>", "YYYY-MM-DD")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolTransactionList({
        peer: opts.peer,
        since: opts.since,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolTxCmd
    .command("show")
    .description("Show transaction by id")
    .argument("<id>", "TX-YYYYMMDD-NNN")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((id, opts) => runProtocolTransactionShow({ id, tenant: opts.tenant, json: opts.json }));
  protocolTxCmd
    .command("prune-orphans")
    .description("List or remove outbound registry rows with no envelope and no witness receipt")
    .option("--peer <id>", "Filter by counterparty PEER-*")
    .option("--since <date>", "YYYY-MM-DD")
    .option("--fetch", "Fetch witness receipts from hub before classifying orphan")
    .option("--apply", "Remove orphans from transactions-registry.yaml (default: dry-run)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolTransactionPruneOrphans({
        peer: opts.peer,
        since: opts.since,
        fetch: opts.fetch,
        apply: opts.apply,
        tenant: opts.tenant,
        json: opts.json,
      })
    );

  const protocolNoticeCmd = protocolCmd
    .command("notice")
    .description("Operator-proposed inter-org wire (wire-governance approval gate)");
  protocolNoticeCmd
    .command("draft")
    .description("Secretary: draft notice (default operator 秘書オペレータ)")
    .requiredOption("--peer <id>", "PEER-*")
    .option("--type <type>", "Wire type")
    .option("--contract <id>", "CTR-*")
    .option("--correlation-event <uuid>", "Inbound event_id (obligation.acknowledged)")
    .option("--company-event <id>", "EVT-* (link outbound wire to company event)")
    .option("--operator <name>", "Override operator")
    .option("--message <text>", "Notice body")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolNoticeDraft({
        peer: opts.peer,
        type: opts.type,
        contract: opts.contract,
        correlationEvent: opts.correlationEvent,
        companyEvent: opts.companyEvent,
        operator: opts.operator,
        message: opts.message,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolNoticeCmd
    .command("propose")
    .description("Operator drafts notice — does not transmit")
    .requiredOption("--peer <id>", "PEER-*")
    .requiredOption("--operator <name>", "Org operator (human)")
    .option("--type <type>", "Wire type (default contract.execution.notice)")
    .option("--contract <id>", "CTR-* (execution notice / contract.executed)")
    .option("--correlation-event <uuid>", "Inbound event_id (obligation.acknowledged)")
    .option("--company-event <id>", "EVT-* (link outbound wire to company event)")
    .option("--invoice <id>", "Invoice id (invoice.issued)")
    .option("--broker-instruction <id>", "Broker instruction (payment.instructed)")
    .option("--amount <n>", "Amount (payment.instructed)", parseFloat)
    .option("--currency <code>", "ISO currency", "JPY")
    .option("--stakeholder <id>", "STK-*")
    .option("--message <text>", "Notice body (L1)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolNoticePropose({
        peer: opts.peer,
        operator: opts.operator,
        type: opts.type,
        contract: opts.contract,
        correlationEvent: opts.correlationEvent,
        companyEvent: opts.companyEvent,
        invoice: opts.invoice,
        brokerInstruction: opts.brokerInstruction,
        amount: opts.amount,
        currency: opts.currency,
        stakeholder: opts.stakeholder,
        message: opts.message,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolNoticeCmd
    .command("list")
    .description("List pending / historical notices")
    .option("--status <status>", "pending_approval | transmitted | rejected")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolNoticeList({ status: opts.status, tenant: opts.tenant, json: opts.json })
    );
  protocolNoticeCmd
    .command("approve")
    .description("Approver (CEO etc.) authorizes transmission to peer org")
    .requiredOption("--id <id>", "NOTICE-*")
    .requiredOption("--approver <name>", "Approver name (L1)")
    .option("--co-approver <name>", "Second approver (wire-governance tier B)")
    .option("--operator <name>", "Override operator id")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolNoticeApprove({
        id: opts.id,
        approver: opts.approver,
        coApprover: opts.coApprover,
        operator: opts.operator,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolNoticeCmd
    .command("reject")
    .description("Reject pending notice")
    .requiredOption("--id <id>", "NOTICE-*")
    .requiredOption("--approver <name>", "Approver name")
    .option("--reason <text>", "Rejection reason")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolNoticeReject({
        id: opts.id,
        approver: opts.approver,
        reason: opts.reason,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolNoticeCmd
    .command("show")
    .description("Show notice by id")
    .argument("<id>", "NOTICE-*")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((id, opts) => runProtocolNoticeShow({ id, tenant: opts.tenant, json: opts.json }));

  const protocolAuditCmd = protocolCmd.command("audit").description("Protocol audit chain");
  protocolAuditCmd
    .command("verify")
    .description("Verify hash chain integrity")
    .option("--since <date>", "YYYY-MM-DD")
    .option("--with-envelopes", "Verify digests using outbox/inbox envelope files")
    .option("--require-envelopes", "Fail when chain entries lack envelope files")
    .option("--chain <path>", "Audit chain JSONL path (third-party verify)")
    .option(
      "--envelope-dir <path>",
      "Envelope directory (repeatable)",
      (v: string, prev: string[]) => [...prev, v],
      [] as string[]
    )
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolAuditVerify({
        since: opts.since,
        tenant: opts.tenant,
        json: opts.json,
        withEnvelopes: opts.withEnvelopes,
        requireEnvelopes: opts.requireEnvelopes,
        chainPath: opts.chain,
        envelopeDir: opts.envelopeDir,
      })
    );

  const protocolVerifyCmd = protocolCmd.command("verify").description("Third-party protocol verification");
  protocolVerifyCmd
    .command("audit-chain")
    .description("Verify audit-chain with optional envelope digest checks")
    .option("--chain <path>", "Audit chain JSONL path")
    .option(
      "--envelope-dir <path>",
      "Envelope directory (repeatable)",
      (v: string, prev: string[]) => [...prev, v],
      [] as string[]
    )
    .option("--since <date>", "YYYY-MM-DD")
    .option("--require-envelopes", "Fail when envelope files are missing")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolVerifyAuditChain({
        chain: opts.chain,
        envelopeDir: opts.envelopeDir,
        since: opts.since,
        requireEnvelopes: opts.requireEnvelopes,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolVerifyCmd
    .command("delegation")
    .description("Verify exported DelegationProof JSON (structure + grant validity)")
    .requiredOption("--file <path>", "JSON file")
    .option("--json", "JSON output")
    .action((opts) => runProtocolVerifyDelegation({ file: opts.file, json: opts.json }));

  const protocolSigningCmd = protocolCmd.command("signing").description("Protocol envelope signing");
  protocolSigningCmd
    .command("export-public")
    .description("Export base64 protocol public key for peer registration")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolSigningExportPublic({ tenant: opts.tenant, json: opts.json }));
  protocolSigningCmd
    .command("rotate")
    .description("Rotate protocol signing key (backs up previous key)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolSigningRotate({ tenant: opts.tenant, json: opts.json }));

  const protocolDeliverCmd = protocolCmd
    .command("deliver")
    .description("POST envelope to peer or show delivery attempt status (R5)")
    .option("--peer <id>", "PEER-* (legacy top-level deliver)")
    .option("--file <path>", "Envelope JSON file")
    .option("--tenant <id>", "Tenant id")
    .action((opts, cmd) => {
      if (cmd.args[0] === "status") return;
      if (opts.peer && opts.file) {
        return runProtocolDeliver({ peer: opts.peer, file: opts.file, tenant: opts.tenant });
      }
      if (!cmd.args.length) {
        protocolDeliverCmd.help({ error: true });
      }
    });

  protocolDeliverCmd
    .command("status")
    .description("Show delivery attempt history for an event")
    .requiredOption("--event-id <uuid>", "Event id")
    .option("--peer <peerId>", "Filter by peer id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolDeliverStatus({
        eventId: opts.eventId,
        peerId: opts.peer,
        json: opts.json,
      })
    );

  const protocolGovGatewayCmd = protocolCmd
    .command("gov-gateway")
    .description("National Gov Gateway adapters (I3-b Wire buffer)");
  protocolGovGatewayCmd
    .command("validate")
    .description("Validate registry + profile YAML + optional tenant gov-gateway.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolGovGatewayValidate({ tenant: opts.tenant, json: opts.json }));
  protocolGovGatewayCmd
    .command("encode")
    .description("Encode outbox/inbox EventEnvelope to native Gov Gateway message")
    .requiredOption("--event-id <uuid>", "Envelope event_id")
    .requiredOption("--profile <id>", "Profile id (e.g. xroad_v7)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolGovGatewayEncode({
        eventId: opts.eventId,
        profile: opts.profile,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolGovGatewayCmd
    .command("decode")
    .description("Decode native Gov Gateway JSON file to EventEnvelope")
    .requiredOption("--file <path>", "Native JSON file")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolGovGatewayDecode({ file: opts.file, tenant: opts.tenant, json: opts.json })
    );
  protocolGovGatewayCmd
    .command("health")
    .description("Adapter health; --live pings sandbox URL from env or gov-gateway.yaml")
    .requiredOption("--profile <id>", "Profile id")
    .option("--tenant <id>", "Tenant id")
    .option("--live", "Ping sandbox endpoint (GOV_*_URL env or binding URL)")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolGovGatewayHealth({
        profile: opts.profile,
        tenant: opts.tenant,
        live: opts.live,
        json: opts.json,
      })
    );
  const protocolGovGatewaySandboxCmd = protocolGovGatewayCmd
    .command("sandbox")
    .description("Gov Gateway sandbox pilot wiring");
  protocolGovGatewaySandboxCmd
    .command("init")
    .description("Copy gov-gateway-live-pilot.yaml.example → tenant gov-gateway.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--force", "Overwrite existing gov-gateway.yaml")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolGovGatewaySandboxInit({
        tenant: opts.tenant,
        force: opts.force,
        json: opts.json,
      })
    );

  protocolCmd
    .command("deliver-flush-pending")
    .description("Retry wire deliveries queued in data/protocol/wire-pending.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolDeliverFlushPending({ tenant: opts.tenant, json: opts.json })
    );

  const protocolMailCmd = protocolCmd.command("mail").description("R5 email-wire protocol path");
  protocolMailCmd
    .command("wire-scan")
    .description("Scan received mail for Wire MIME envelopes (Phase 2 ingest)")
    .option("--tenant <id>", "Tenant id")
    .option("--since-days <n>", "Lookback days", "7")
    .option("--dry-run", "Parse only — do not ingest")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolMailWireScan({
        tenant: opts.tenant,
        sinceDays: opts.sinceDays ? parseInt(opts.sinceDays, 10) : undefined,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );

  protocolCmd
    .command("deliver-pull")
    .description("Pull envelope from peer outbox API into local protocol inbox")
    .requiredOption("--peer <id>", "PEER-*")
    .requiredOption("--event-id <uuid>", "Envelope event_id")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolDeliverPull({
        peer: opts.peer,
        eventId: opts.eventId,
        tenant: opts.tenant,
        json: opts.json,
      })
    );

  protocolCmd
    .command("trusted-hubs")
    .description("List jurisdiction-trusted witness hubs from platform registry")
    .option("--jurisdiction <code>", "ISO jurisdiction code")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolTrustedHubsList({
        jurisdiction: opts.jurisdiction,
        tenant: opts.tenant,
        json: opts.json,
      })
    );

  protocolCmd
    .command("trusted-hubs-validate")
    .description("Validate platform trusted-hubs.yaml committee registry")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolTrustedHubsValidate({ tenant: opts.tenant, json: opts.json }));

  protocolCmd
    .command("trusted-hubs-sync-keys")
    .description("Fetch hub_public_key from running hubs and update trusted-hubs.yaml")
    .option("--jurisdiction <code>", "Limit to jurisdiction (e.g. JP)")
    .option("--hub-url <url>", "Sync single hub by URL")
    .option("--force", "Re-fetch even when hub_public_key is set")
    .option("--dry-run", "Report changes without writing YAML")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolTrustedHubsSyncKeys({
        jurisdiction: opts.jurisdiction,
        hubUrl: opts.hubUrl,
        force: opts.force,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );

  const protocolTrustRegistryCmd = protocolCmd
    .command("trust-registry")
    .description("Wire Trust Registry — Node ID / DID resolution (WG-4)");
  protocolTrustRegistryCmd
    .command("validate")
    .description("Validate steward/platform/protocol/wire-trust-registry.yaml")
    .option("--json", "JSON output")
    .action((opts) => runProtocolTrustRegistryValidate({ json: opts.json }));
  protocolTrustRegistryCmd
    .command("list")
    .description("List registered Wire nodes")
    .option("--json", "JSON output")
    .action((opts) => runProtocolTrustRegistryList({ json: opts.json }));
  protocolTrustRegistryCmd
    .command("resolve")
    .description("Resolve node by node_id, did:ooo:…, or steward:// URI")
    .requiredOption("--id <identifier>", "Node identifier")
    .option("--json", "JSON output")
    .action((opts) => runProtocolTrustRegistryResolve({ id: opts.id, json: opts.json }));
  protocolTrustRegistryCmd
    .command("sync-keys")
    .description("Fetch protocol_public_key from Gateway /.well-known/wire-node.json")
    .option("--node-id <id>", "Limit to node_id")
    .option("--wire-url <url>", "Override wire_url for fetch")
    .option("--force", "Re-fetch even when protocol_public_key is set")
    .option("--dry-run", "Report without writing YAML")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolTrustRegistrySyncKeys({
        nodeId: opts.nodeId,
        wireUrl: opts.wireUrl,
        force: opts.force,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );
  protocolTrustRegistryCmd
    .command("pin-local")
    .description("Pin local tenant signing public key into wire-trust-registry.yaml")
    .option("--tenant <id>", "Tenant id (default: global --tenant / ORGOS_TENANT)")
    .option("--node-id <id>", "Limit to node_id")
    .option("--force", "Overwrite existing protocol_public_key")
    .option("--dry-run", "Report without writing YAML")
    .option("--bypass-governance", "Skip governance gate (dev only)")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolTrustRegistryPinLocal({
        tenant: opts.tenant,
        nodeId: opts.nodeId,
        force: opts.force,
        dryRun: opts.dryRun,
        bypassGovernance: opts.bypassGovernance,
        json: opts.json,
      })
    );
  protocolTrustRegistryCmd
    .command("submit")
    .description("Submit wire node governance request (Community registry onboarding)")
    .requiredOption("--tenant <id>", "Tenant id")
    .option("--wire-email <email>", "Wire SMTP delivery address")
    .option("--public-id <value>", "public_ids e.g. corporate_number:4010001189530")
    .option("--requested-by <id>", "Operator id")
    .option("--wire-url <url>", "Wire gateway public URL")
    .option("--json", "JSON output")
    .action((opts) => {
      const publicId = opts.publicId as string | undefined;
      const corporateNumber = publicId?.startsWith("corporate_number:")
        ? publicId.slice("corporate_number:".length)
        : publicId;
      return runProtocolTrustRegistrySubmit({
        tenant: opts.tenant,
        wireEmail: opts.wireEmail,
        corporateNumber,
        requestedBy: opts.requestedBy,
        wireUrl: opts.wireUrl,
        json: opts.json,
      });
    });
  protocolTrustRegistryCmd
    .command("decide")
    .description("Approve or reject a pending wire node governance request")
    .requiredOption("--request-id <uuid>", "Governance request id")
    .requiredOption("--decided-by <id>", "Committee chair / approver id")
    .option("--approve", "Approve request")
    .option("--reject", "Reject request")
    .option("--note <text>", "Decision note")
    .option("--json", "JSON output")
    .action((opts) => {
      if (!opts.approve && !opts.reject) {
        console.error("Specify --approve or --reject");
        process.exit(1);
      }
      return runProtocolTrustRegistryDecide({
        requestId: opts.requestId,
        approve: !!opts.approve,
        reject: !!opts.reject,
        decidedBy: opts.decidedBy,
        note: opts.note,
        json: opts.json,
      });
    });
  protocolTrustRegistryCmd
    .command("pending")
    .description("List pending wire node governance requests")
    .option("--json", "JSON output")
    .action((opts) => runProtocolTrustRegistryPending({ json: opts.json }));

  const protocolCommunityCmd = protocolCmd
    .command("community")
    .description("C4 trusted operators · revocation SLA · governance");
  protocolCommunityCmd
    .command("operators")
    .description("List trusted witness operators")
    .option("--jurisdiction <code>", "Filter by jurisdiction")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolCommunityOperatorsList({ jurisdiction: opts.jurisdiction, json: opts.json })
    );
  protocolCommunityCmd
    .command("operators-validate")
    .description("Validate steward/platform/protocol/trusted-operators.yaml")
    .option("--json", "JSON output")
    .action((opts) => runProtocolCommunityOperatorsValidate({ json: opts.json }));
  const protocolCommunityIntegrationCmd = protocolCommunityCmd
    .command("integration")
    .description("Platform shipping flags (publish/protocol/community-integration.json)");
  protocolCommunityIntegrationCmd
    .command("list")
    .description("List shipping flags")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { readCommunityIntegrationFlags } = await import(
        "../../../lib/protocol/adapters/community-integration-flags.js"
      );
      const flags = readCommunityIntegrationFlags();
      if (opts.json) {
        console.log(JSON.stringify({ ok: true, flags }, null, 2));
        return;
      }
      for (const [flag, value] of Object.entries(flags)) {
        console.log(`${value ? "✓" : "·"} ${flag}`);
      }
    });
  protocolCommunityIntegrationCmd
    .command("set")
    .description("Set a shipping flag (replaces hand-editing the JSON)")
    .requiredOption("--flag <name>", "e.g. tenant_mail_connect_api")
    .requiredOption("--value <bool>", "true | false")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { isCommunityIntegrationFlag, setCommunityIntegrationFlag } = await import(
        "../../../lib/protocol/adapters/community-integration-flags.js"
      );
      if (!isCommunityIntegrationFlag(opts.flag)) {
        console.error(`✗ unknown flag: ${opts.flag}`);
        process.exit(1);
      }
      const value = opts.value === "true";
      const flags = setCommunityIntegrationFlag(opts.flag, value);
      if (opts.json) {
        console.log(JSON.stringify({ ok: true, flags }, null, 2));
        return;
      }
      console.log(`✓ ${opts.flag} = ${value}`);
    });

  protocolCommunityCmd
    .command("check-sla")
    .description("Check revocation SLA for revoked operators")
    .option("--json", "JSON output")
    .action((opts) => runProtocolCommunityCheckSla({ json: opts.json }));
  protocolCommunityCmd
    .command("revoke")
    .description("Revoke a trusted operator (governance)")
    .requiredOption("--operator-id <id>", "OP-*")
    .option("--reason <text>", "Revocation reason")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolCommunityRevoke({ operatorId: opts.operatorId, reason: opts.reason, json: opts.json })
    );
  const protocolCommunityGovCmd = protocolCommunityCmd
    .command("governance")
    .description("Committee operator certification workflow");
  protocolCommunityGovCmd
    .command("submit")
    .description("Submit operator certification request")
    .requiredOption("--operator-id <id>", "OP-*")
    .requiredOption("--org-name <name>", "Operator org name")
    .requiredOption("--jurisdiction <code>", "ISO jurisdiction")
    .requiredOption("--requested-by <id>", "Requester id")
    .option("--hub-id <id>", "Hub id (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolCommunityGovernanceSubmit({
        operatorId: opts.operatorId,
        orgName: opts.orgName,
        jurisdiction: opts.jurisdiction,
        hubIds: opts.hubId,
        requestedBy: opts.requestedBy,
        json: opts.json,
      })
    );
  protocolCommunityGovCmd
    .command("decide")
    .description("Approve or reject governance request")
    .requiredOption("--request-id <uuid>", "Request id")
    .requiredOption("--decided-by <id>", "Committee chair id")
    .option("--approve", "Approve request")
    .option("--reject", "Reject request")
    .option("--note <text>", "Decision note")
    .option("--authority-id <id>", "WTA-* for certified operator")
    .option("--json", "JSON output")
    .action((opts) => {
      if (!opts.approve && !opts.reject) {
        console.error("Specify --approve or --reject");
        process.exit(1);
      }
      runProtocolCommunityGovernanceDecide({
        requestId: opts.requestId,
        approve: !!opts.approve,
        decidedBy: opts.decidedBy,
        note: opts.note,
        authorityId: opts.authorityId,
        json: opts.json,
      });
    });
  protocolCommunityCmd
    .command("readiness")
    .description("Steward-side C4 readiness score")
    .option("--json", "JSON output")
    .action((opts) => runProtocolCommunityReadiness({ json: opts.json }));
  protocolCommunityCmd
    .command("export")
    .description("Export community read bundle to publish/protocol/")
    .option("--json", "JSON output")
    .action((opts) => runProtocolCommunityExport({ json: opts.json }));

  protocolCmd
    .command("approvers")
    .description("List wire-governance authorized approvers from company.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolApproversList({ tenant: opts.tenant, json: opts.json }));

  const protocolWitnessCmd = protocolCmd.command("witness").description("Distributed witness pool");
  protocolWitnessCmd
    .command("register")
    .description("Register attestation to witness pool for event_id")
    .requiredOption("--event-id <uuid>", "Envelope event_id")
    .requiredOption("--side <side>", "sent | received")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolWitnessRegister({
        eventId: opts.eventId,
        side: opts.side,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolWitnessCmd
    .command("flush-pending")
    .description("Retry failed witness attestations in pending queue")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessFlushPending({ tenant: opts.tenant, json: opts.json }));
  protocolWitnessCmd
    .command("verify")
    .description("Verify cached witness receipts and quorum for event_id")
    .requiredOption("--event-id <uuid>", "Envelope event_id")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolWitnessVerify({ eventId: opts.eventId, tenant: opts.tenant, json: opts.json })
    );
  protocolWitnessCmd
    .command("cache-missing")
    .description("Fetch witness hub receipts for outbound txs missing local cache")
    .option("--peer <id>", "Filter by counterparty PEER-*")
    .option("--since <date>", "YYYY-MM-DD")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolWitnessCacheMissing({
        peer: opts.peer,
        since: opts.since,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolWitnessCmd
    .command("reconcile")
    .description("Cross-check local wire · witness · audit with peer outbound txs")
    .requiredOption("--peer <id>", "PEER-*")
    .option("--since <date>", "ISO date YYYY-MM-DD")
    .option("--event-id <uuid>", "Single event_id")
    .option("--cross-hub", "Also compare attestation status across all pool hubs")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolWitnessReconcile({
        peer: opts.peer,
        since: opts.since,
        eventId: opts.eventId,
        crossHub: opts.crossHub,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  const protocolWitnessPoolCmd = protocolWitnessCmd.command("pool").description("Witness pool");
  protocolWitnessPoolCmd
    .command("init-trusted")
    .description("Initialize witness-pool.yaml from jurisdiction trusted_hubs registry")
    .option("--jurisdiction <code>", "ISO jurisdiction code")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runProtocolWitnessPoolInitTrusted({
        jurisdiction: opts.jurisdiction,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolWitnessPoolCmd
    .command("status")
    .description("Check health of configured witness hubs")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessPoolStatus({ tenant: opts.tenant, json: opts.json }));
  protocolWitnessPoolCmd
    .command("init-from-trust")
    .description("Initialize witness-pool.yaml from signed witness trust bundle URL")
    .requiredOption("--bundle-url <url>", "Witness trust bundle URL (Org C PKI)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolWitnessPoolInitFromTrust({
        bundleUrl: opts.bundleUrl,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolWitnessPoolCmd
    .command("init-from-contract")
    .description("Initialize witness-pool.yaml from contract protocol.witness_hubs + trust bundle")
    .requiredOption("--contract <id>", "CTR-*")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolWitnessPoolInitFromContract({
        contract: opts.contract,
        tenant: opts.tenant,
        json: opts.json,
      })
    );

  const protocolWitnessTrustCmd = protocolWitnessCmd
    .command("trust")
    .description("Witness trust network (Org C PKI-style hub certification)");
  protocolWitnessTrustCmd
    .command("init-authority")
    .description("Initialize witness trust authority (Org C)")
    .requiredOption("--authority-id <id>", "WTA-*")
    .requiredOption("--org-name <name>", "Authority org display name")
    .option("--jurisdiction <code>", "ISO jurisdiction")
    .option("--org-uri <uri>", "Org URI")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolWitnessTrustInitAuthority({
        authorityId: opts.authorityId,
        orgName: opts.orgName,
        jurisdiction: opts.jurisdiction,
        orgUri: opts.orgUri,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolWitnessTrustCmd
    .command("certify")
    .description("Certify a witness hub (sign hub public key)")
    .requiredOption("--hub-id <id>", "Hub id")
    .requiredOption("--hub-url <url>", "Hub base URL")
    .option("--hub-public-key <b64>", "Hub SPKI base64 (default: fetch from hub)")
    .option("--expires-at <iso>", "Certificate expiry")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolWitnessTrustCertify({
        hubId: opts.hubId,
        hubUrl: opts.hubUrl,
        hubPublicKey: opts.hubPublicKey,
        expiresAt: opts.expiresAt,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolWitnessTrustCmd
    .command("publish")
    .description("Publish signed witness trust bundle JSON")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolWitnessTrustPublish({ tenant: opts.tenant, json: opts.json }));
  protocolWitnessTrustCmd
    .command("verify")
    .description("Verify witness trust bundle signatures")
    .option("--bundle-url <url>", "Remote bundle URL")
    .option("--bundle-file <path>", "Local bundle JSON")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolWitnessTrustVerify({
        bundleUrl: opts.bundleUrl,
        bundleFile: opts.bundleFile,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  protocolWitnessTrustCmd
    .command("revoke")
    .description("Revoke hub certificate and republish trust bundle")
    .requiredOption("--cert-id <uuid>", "Certificate id")
    .requiredOption("--hub-id <id>", "Hub id")
    .option("--reason <text>", "Revocation reason")
    .option("--operator-id <id>", "OP-* operator")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolWitnessTrustRevoke({
        certId: opts.certId,
        hubId: opts.hubId,
        reason: opts.reason,
        operatorId: opts.operatorId,
        tenant: opts.tenant,
        json: opts.json,
      })
    );

  const protocolRelayCmd = protocolCmd.command("relay").description("Wire + witness relay worker (R1–R4)");
  protocolRelayCmd
    .command("once")
    .description("Run one relay cycle (flush wire/witness pending + reconcile)")
    .option("--tenant <id>", "Tenant id")
    .option("--no-reconcile", "Skip reconcile step")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolRelayOnce({
        tenant: opts.tenant,
        json: opts.json,
        noReconcile: opts.noReconcile,
      })
    );
  protocolRelayCmd
    .command("run")
    .description("Run relay daemon until interrupted")
    .option("--tenant <id>", "Tenant id")
    .option("--interval-sec <n>", "Cycle interval seconds", (v: string) => parseInt(v, 10), 30)
    .option("--max-cycles <n>", "Stop after N cycles")
    .option("--no-reconcile", "Skip reconcile step")
    .action((opts) =>
      runProtocolRelayRun({
        tenant: opts.tenant,
        intervalSec: opts.intervalSec,
        maxCycles: opts.maxCycles,
        noReconcile: opts.noReconcile,
      })
    );
  protocolRelayCmd
    .command("status")
    .description("Show relay worker state and pending counts")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolRelayStatus({ tenant: opts.tenant, json: opts.json }));

  protocolCmd
    .command("sla")
    .description("Check resilience SLA tier for outbound transactions")
    .option("--event-id <uuid>", "Single event")
    .option("--tier <tier>", "bronze | silver | gold", "silver")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolSlaCheck({
        eventId: opts.eventId,
        tier: opts.tier,
        tenant: opts.tenant,
        json: opts.json,
      })
    );

  protocolCmd
    .command("api-serve")
    .description("Protocol pull inbox · outbox · trust bundle (HTTPS) · relay API (mTLS)")
    .option("--host <host>", "Bind host", "127.0.0.1")
    .option("--port <n>", "Port", (v: string) => parseInt(v, 10), 9476)
    .option("--tls-cert <path>", "Server TLS certificate (PEM)")
    .option("--tls-key <path>", "Server TLS private key (PEM)")
    .option("--tls-ca <path>", "Client CA for mTLS verification (PEM)")
    .option("--mtls-required", "Require client cert on relay/inbox/outbox")
    .option("--mtls-allowed-org <uri>", "Allowed client org_uri (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--tenant <id>", "Tenant id")
    .action((opts) =>
      runProtocolApiServe({
        host: opts.host,
        port: opts.port,
        tenant: opts.tenant,
        tlsCert: opts.tlsCert,
        tlsKey: opts.tlsKey,
        tlsCa: opts.tlsCa,
        mtlsRequired: opts.mtlsRequired,
        mtlsAllowedOrg: opts.mtlsAllowedOrg,
      })
    );

  const protocolTlsCmd = protocolCmd.command("tls").description("Protocol API TLS lifecycle");
  protocolTlsCmd
    .command("verify")
    .description("Verify HTTPS trust bundle (+ mTLS metrics when client cert configured)")
    .option("--tenant <id>", "Tenant id")
    .option("--url <url>", "Trust bundle URL (default: contract or https://127.0.0.1:9486/...)")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolTlsVerify({
        tenant: opts.tenant,
        url: opts.url,
        json: opts.json,
      })
    );
  protocolTlsCmd
    .command("init-proposal3")
    .description("Generate dev PKI + protocol-api-client.yaml for Proposal 3 (Org C mTLS)")
    .option("--org-c <tenant>", "Org C tenant id", "aiac")
    .option("--client <id>", "Party tenant with client cert (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--force", "Regenerate existing PKI material")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolTlsInitProposal3({
        orgCTenant: opts.orgC,
        clients: opts.client.length ? opts.client : undefined,
        force: opts.force,
        json: opts.json,
      })
    );
  protocolTlsCmd
    .command("rotate")
    .description("Write TLS cert rotation checklist (production)")
    .option("--tenant <id>", "Tenant id")
    .option("--cert-path <path>", "Target server cert PEM path")
    .option("--key-path <path>", "Target server key PEM path")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolTlsRotate({
        tenant: opts.tenant,
        certPath: opts.certPath,
        keyPath: opts.keyPath,
        json: opts.json,
      })
    );

}
