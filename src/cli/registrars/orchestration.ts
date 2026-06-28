import type { Command } from "commander";
import {
  runRouteList,
  runRouteMatch,
  runRouteSuggest,
  runRouteHandoff,
  runRouteDispatch,
} from "../../commands/route.js";
import {
  runEscalatePlan,
  runEscalateRun,
  runEscalateStatus,
  runEscalateComplete,
  runEscalateMerge,
} from "../../commands/escalate.js";
import {
  runAgentDispatchPlan,
  runAgentDispatchRun,
  runAgentCloudConfig,
  runAgentCloudWatch,
} from "../../commands/agent.js";
import { runQueuePush, runQueueList, runQueueDrain } from "../../commands/queue.js";
import { runWebhookConfig, runWebhookSend, runWebhookIngest, runWebhookServe } from "../../commands/webhook.js";
import { runMergePrPlan, runMergePrCreate } from "../../commands/merge-pr.js";
import { runAuditLogAppend, runAuditLogList } from "../../commands/audit.js";
import {
  runOrgApprovalPropose,
  runOrgApprovalApprove,
  runOrgApprovalReject,
  runOrgApprovalList,
  runOrgApprovalShow,
  runOrgAuditBridge,
} from "../../commands/org.js";
import {
  runProtocolValidate,
  runProtocolOutboxApplyPermissions,
  runProtocolOutboxCheckPermissions,
  runProtocolIdentityExport,
  runProtocolIdentityValidate,
  runProtocolPeerRegister,
  runProtocolPeerDiscover,
  runProtocolDelegationExport,
  runProtocolDelegationValidate,
  runProtocolTransactionRecord,
  runProtocolTransactionList,
  runProtocolTransactionShow,
  runProtocolAuditVerify,
  runProtocolVerifyAuditChain,
  runProtocolVerifyDelegation,
  runProtocolEnvelopeValidate,
  runProtocolNoticePropose,
  runProtocolNoticeList,
  runProtocolNoticeApprove,
  runProtocolNoticeReject,
  runProtocolNoticeShow,
  runProtocolSigningExportPublic,
  runProtocolSigningRotate,
  runProtocolDeliver,
  runProtocolDeliverFlushPending,
  runProtocolDeliverPull,
  runProtocolMeshDeliver,
  runProtocolNoticeDraft,
  runProtocolApproversList,
  runProtocolWitnessRegister,
  runProtocolWitnessFlushPending,
  runProtocolWitnessVerify,
  runProtocolWitnessReconcile,
  runProtocolWitnessPoolStatus,
  runProtocolTrustedHubsList,
  runProtocolTrustedHubsValidate,
  runProtocolWitnessPoolInitTrusted,
  runProtocolRelayOnce,
  runProtocolRelayRun,
  runProtocolRelayStatus,
  runProtocolWitnessTrustInitAuthority,
  runProtocolWitnessTrustCertify,
  runProtocolWitnessTrustPublish,
  runProtocolWitnessTrustVerify,
  runProtocolWitnessPoolInitFromTrust,
  runProtocolWitnessPoolInitFromContract,
  runProtocolApiServe,
  runProtocolSlaCheck,
  runProtocolCommunityOperatorsList,
  runProtocolCommunityOperatorsValidate,
  runProtocolCommunityCheckSla,
  runProtocolCommunityRevoke,
  runProtocolCommunityGovernanceSubmit,
  runProtocolCommunityGovernanceDecide,
  runProtocolCommunityReadiness,
  runProtocolWitnessTrustRevoke,
  runProtocolTlsRotate,
} from "../../commands/protocol.js";
import {
  runHubServe,
  runHubExportPublicKey,
  runHubVerify,
  runHubAnchorExport,
  runHubAnchorShow,
  runHubAnchorVerify,
  runHubGossipExport,
  runHubGossipAttestationExport,
  runHubFederationShow,
  runHubFederationAddPeer,
  runHubGossipSync,
} from "../../commands/hub.js";

export function registerOrchestrationCommands(program: Command): void {
  const routeCmd = program.command("route").description("Agent inter-routing (registry · access · handoff)");
  routeCmd.command("list").description("List static route registry").action(runRouteList);
  routeCmd
    .command("match")
    .description("Match routes by --text and/or --path")
    .option("--text <text>", "User intent or message text")
    .option("--path <path>", "Resource path (logical)")
    .option("--json", "JSON output")
    .action((opts) => runRouteMatch({ text: opts.text, path: opts.path, json: opts.json }));
  routeCmd
    .command("suggest")
    .description("Suggest handoff card (console)")
    .option("--from <agent>", "Source agent", "steward")
    .option("--to <agent>", "Target agent (override match)")
    .option("--skill <id>", "Skill id (override match)")
    .option("--text <text>", "Intent text for match")
    .option("--path <path>", "Path for match")
    .option("--route-id <id>", "Force route id from registry")
    .option("--mode <mode>", "suggest | auto", "suggest")
    .option("--json", "JSON output")
    .action((opts) =>
      runRouteSuggest({
        from: opts.from,
        to: opts.to,
        skill: opts.skill,
        text: opts.text,
        path: opts.path,
        routeId: opts.routeId,
        mode: opts.mode,
        json: opts.json,
      })
    );
  routeCmd
    .command("handoff")
    .description("Write handoff YAML/MD to docs/reports/routing-queue/")
    .option("--from <agent>", "Source agent", "steward")
    .option("--to <agent>", "Target agent (override match)")
    .option("--skill <id>", "Skill id")
    .option("--text <text>", "Intent text for match")
    .option("--path <path>", "Path for match")
    .option("--route-id <id>", "Force route id")
    .option("--mode <mode>", "suggest | auto", "suggest")
    .option("--notes <text>", "Optional notes")
    .action((opts) =>
      runRouteHandoff({
        from: opts.from,
        to: opts.to,
        skill: opts.skill,
        text: opts.text,
        path: opts.path,
        routeId: opts.routeId,
        mode: opts.mode,
        notes: opts.notes,
      })
    );
  routeCmd
    .command("dispatch")
    .description("Dispatch handoff by id (suggest default; auto runs skills CLI)")
    .requiredOption("--id <id>", "Handoff id (HO-... or IMP-...)")
    .option("--mode <mode>", "suggest | auto | implement")
    .action((opts) => runRouteDispatch({ id: opts.id, mode: opts.mode }));

  const escalateCmd = program.command("escalate").description("Delegation / work orders (implement task routing)");
  escalateCmd
    .command("plan")
    .description("Plan work orders from request text (dry-run default)")
    .option("--text <text>", "Request or structured escalation input")
    .option("--path <path>", "Resource path for route match")
    .option("--subject <text>", "Work order subject")
    .option("--background <text>", "Background context")
    .option("--requirements <text>", "Implementation requirements")
    .option("--deliverable <d>", "Deliverable (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--acceptance <c>", "Acceptance criterion (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--priority <p>", "P0 | P1 | P2 | P3")
    .option("--tenant <id>", "Tenant id")
    .option("--dry-run", "Plan only (default)", true)
    .option("--json", "JSON output")
    .action((opts) =>
      runEscalatePlan({
        text: opts.text,
        path: opts.path,
        subject: opts.subject,
        background: opts.background,
        requirements: opts.requirements,
        deliverables: opts.deliverable,
        acceptance: opts.acceptance,
        priority: opts.priority,
        tenant: opts.tenant,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );
  escalateCmd
    .command("run")
    .description("Generate work orders + agent implementation prompt MD")
    .option("--text <text>", "Request text")
    .option("--path <path>", "Resource path")
    .option("--subject <text>", "Subject")
    .option("--background <text>", "Background")
    .option("--requirements <text>", "Requirements")
    .option("--deliverable <d>", "Deliverable", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--acceptance <c>", "Acceptance criterion", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--priority <p>", "P0 | P1 | P2 | P3")
    .option("--from <agent>", "Source agent", "executive_steward")
    .option("--tenant <id>", "Tenant id")
    .option("--id <id>", "Regenerate prompts from existing HO-/IMP- id")
    .action((opts) =>
      runEscalateRun({
        text: opts.text,
        path: opts.path,
        subject: opts.subject,
        background: opts.background,
        requirements: opts.requirements,
        deliverables: opts.deliverable,
        acceptance: opts.acceptance,
        priority: opts.priority,
        from: opts.from,
        tenant: opts.tenant,
        id: opts.id,
      })
    );
  escalateCmd
    .command("status")
    .description("List work orders in routing-queue")
    .option("--pending", "Pending only")
    .option("--blocked", "Blocked only")
    .option("--json", "JSON output")
    .action((opts) => runEscalateStatus({ pending: opts.pending, blocked: opts.blocked, json: opts.json }));
  escalateCmd
    .command("complete")
    .description("Mark work order completed (+ auto-merge parent when all siblings done)")
    .requiredOption("--id <id>", "Work order id (IMP-...)")
    .option("--notes <text>", "Completion notes / result summary")
    .action((opts) => runEscalateComplete({ id: opts.id, notes: opts.notes }));
  escalateCmd
    .command("merge")
    .description("Merge completed work order results into executive-notes")
    .requiredOption("--id <id>", "Parent or child IMP id")
    .option("--output <filename>", "Output filename under executive-notes/")
    .option("--auto-complete", "Mark parent completed when all children done")
    .action((opts) =>
      runEscalateMerge({ id: opts.id, output: opts.output, autoComplete: opts.autoComplete })
    );

  const agentCmd = program.command("agent").description("Agent parallel dispatch (Phase 2)");
  const agentDispatchCmd = agentCmd.command("dispatch").description("Dispatch work orders");
  agentDispatchCmd
    .command("plan")
    .description("Plan parallel dispatch manifest")
    .requiredOption("--id <id>", "Work order id (IMP-...)")
    .option("--parallel <n>", "Max parallel agents", "3")
    .option("--runtime <mode>", "local | cloud | manifest", "auto")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runAgentDispatchPlan({
        id: opts.id,
        parallel: Number(opts.parallel),
        runtime: opts.runtime === "auto" ? undefined : opts.runtime,
        json: opts.json,
      })
    );
  agentDispatchCmd
    .command("run")
    .description("Run dispatch (local/cloud SDK or manifest)")
    .requiredOption("--id <id>", "Work order id")
    .option("--parallel <n>", "Max parallel", "3")
    .option("--runtime <mode>", "local | cloud | manifest")
    .option("--dry-run", "Write manifest only")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runAgentDispatchRun({
        id: opts.id,
        parallel: Number(opts.parallel),
        runtime: opts.runtime,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );

  const agentCloudCmd = agentCmd.command("cloud").description("Cloud Agent runtime (Phase 3)");
  agentCloudCmd.command("config").description("Show cloud agent config").action(runAgentCloudConfig);
  agentCloudCmd
    .command("watch")
    .description("Poll queue and dispatch via cloud/local SDK")
    .option("--interval <ms>", "Poll interval ms", "30000")
    .option("--once", "Single poll cycle")
    .option("--parallel <n>", "Parallel dispatch", "3")
    .action(async (opts) =>
      runAgentCloudWatch({
        interval: Number(opts.interval),
        once: opts.once,
        parallel: Number(opts.parallel),
      })
    );

  const queueCmd = program.command("queue").description("Work order event queue (JSONL DB)");
  queueCmd
    .command("push")
    .description("Push queue event")
    .requiredOption("--type <type>", "Event type")
    .requiredOption("--ref <ref>", "Reference id")
    .option("--payload <json>", "JSON payload")
    .option("--tenant <id>", "Tenant id")
    .action((opts) => runQueuePush({ type: opts.type, ref: opts.ref, payload: opts.payload, tenant: opts.tenant }));
  queueCmd
    .command("list")
    .description("List queue events")
    .option("--status <status>", "pending | done | failed")
    .option("--type <type>", "Event type filter")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runQueueList({ status: opts.status, type: opts.type, tenant: opts.tenant, json: opts.json }));
  queueCmd
    .command("drain")
    .description("Process pending queue events")
    .option("--tenant <id>", "Tenant id")
    .option("--dry-run", "List only")
    .action((opts) => runQueueDrain({ tenant: opts.tenant, dryRun: opts.dryRun }));

  const webhookCmd = program.command("webhook").description("Webhook outbound/inbound (Phase 2)");
  webhookCmd.command("config").description("Show webhook registry").action(runWebhookConfig);
  webhookCmd
    .command("send")
    .description("Send outbound webhook")
    .requiredOption("--event <name>", "Event name")
    .option("--ref <id>", "Reference id")
    .option("--payload <file|json>", "Payload file or JSON string")
    .action(async (opts) => runWebhookSend({ event: opts.event, ref: opts.ref, payload: opts.payload }));
  webhookCmd
    .command("ingest")
    .description("Ingest inbound webhook payload file → queue")
    .requiredOption("--file <path>", "JSON payload file")
    .option("--secret <secret>", "Override secret")
    .action((opts) => runWebhookIngest({ file: opts.file, secret: opts.secret }));
  webhookCmd
    .command("serve")
    .description("Start inbound HTTP webhook server")
    .option("--host <host>", "Bind host")
    .option("--port <port>", "Bind port")
    .option("--once", "Start and exit (health check)")
    .action(async (opts) =>
      runWebhookServe({
        host: opts.host,
        port: opts.port ? Number(opts.port) : undefined,
        once: opts.once,
      })
    );

  const mergeCmd = program.command("merge").description("Work order merge · PR (Phase 3)");
  const mergePrCmd = mergeCmd.command("pr").description("Pull request from merged work order");
  mergePrCmd
    .command("plan")
    .description("Plan PR branch and body")
    .requiredOption("--id <id>", "Work order id (IMP-...)")
    .option("--base <branch>", "Base branch", "main")
    .option("--json", "JSON output")
    .action((opts) => runMergePrPlan({ id: opts.id, base: opts.base, json: opts.json }));
  mergePrCmd
    .command("create")
    .description("Create branch, commit, and gh pr create")
    .requiredOption("--id <id>", "Work order id")
    .option("--base <branch>", "Base branch", "main")
    .option("--dry-run", "Plan only")
    .option("--allow-empty", "Allow commit with no changes")
    .option("--json", "JSON output")
    .action((opts) =>
      runMergePrCreate({
        id: opts.id,
        base: opts.base,
        dryRun: opts.dryRun,
        allowEmpty: opts.allowEmpty,
        json: opts.json,
      })
    );

  const auditCmd = program.command("audit").description("Append-only audit trail");
  const auditLogCmd = auditCmd.command("log").description("Audit log");
  auditLogCmd
    .command("append")
    .description("Append audit event")
    .requiredOption("--event <type>", "handoff | validate | classification_block | escalate | route_dispatch")
    .requiredOption("--ref <id>", "Reference id or path")
    .option("--actor <agent>", "Actor agent id")
    .option("--detail <text>", "Detail")
    .option("--tenant <id>", "Tenant id")
    .action((opts) =>
      runAuditLogAppend({
        event: opts.event,
        ref: opts.ref,
        actor: opts.actor,
        detail: opts.detail,
        tenant: opts.tenant,
      })
    );
  auditLogCmd
    .command("list")
    .description("List audit events")
    .option("--since <date>", "YYYY-MM-DD")
    .option("--tenant <id>", "Tenant id")
    .option("--event <type>", "Filter by event type")
    .option("--json", "JSON output")
    .action((opts) =>
      runAuditLogList({
        since: opts.since,
        tenant: opts.tenant,
        event: opts.event,
        json: opts.json,
      })
    );

  const complianceCmd = program.command("compliance").description("Compliance tooling");
  complianceCmd
    .command("gap")
    .description("ISO × REG gap table for active tenant")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runComplianceGap({ tenant: opts.tenant, json: opts.json }));

  const protocolCmd = program.command("protocol").description("Inter-org protocol (OpenOrgOS Core wire)");
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

  const protocolNoticeCmd = protocolCmd
    .command("notice")
    .description("Operator-proposed inter-org wire (wire-governance approval gate)");
  protocolNoticeCmd
    .command("draft")
    .description("Secretary: draft notice (default operator 秘書オペレータ)")
    .requiredOption("--peer <id>", "PEER-*")
    .option("--type <type>", "Wire type")
    .option("--contract <id>", "CTR-*")
    .option("--correlation-event <uuid>", "For ack")
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

  protocolCmd
    .command("deliver")
    .description("POST envelope JSON to peer inbound_webhook_url (store-and-forward on failure)")
    .requiredOption("--peer <id>", "PEER-*")
    .requiredOption("--file <path>", "Envelope JSON file")
    .option("--tenant <id>", "Tenant id")
    .action((opts) => runProtocolDeliver({ peer: opts.peer, file: opts.file, tenant: opts.tenant }));

  protocolCmd
    .command("deliver-flush-pending")
    .description("Retry wire deliveries queued in data/protocol/wire-pending.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolDeliverFlushPending({ tenant: opts.tenant, json: opts.json })
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
    .description("Steward-side C4 readiness score (max 80)")
    .option("--json", "JSON output")
    .action((opts) => runProtocolCommunityReadiness({ json: opts.json }));

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

  const orgCmd = program.command("org").description("Universal org activity root (approval · audit bridge)");
  const orgApprovalCmd = orgCmd.command("approval").description("Internal human approval (scope: internal)");
  orgApprovalCmd
    .command("propose")
    .description("Propose internal approval (Secretary / operator)")
    .requiredOption("--subject-type <type>", "e.g. regulation.amendment")
    .requiredOption("--operator <name>", "Proposer")
    .option("--subject-ref <ref>", "Subject reference (REG-* · CTR-*)")
    .option("--message <text>", "Summary")
    .option("--amount <n>", "Amount for tier gate", parseFloat)
    .option("--currency <code>", "ISO currency", "JPY")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runOrgApprovalPropose({
        subjectType: opts.subjectType,
        operator: opts.operator,
        subjectRef: opts.subjectRef,
        message: opts.message,
        amount: opts.amount,
        currency: opts.currency,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  orgApprovalCmd
    .command("approve")
    .description("Approve internal pending request")
    .requiredOption("--id <id>", "APR-*")
    .requiredOption("--approver <name>", "Approver")
    .option("--co-approver <name>", "Second approver (tier B)")
    .option("--operator <name>", "Override operator id")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runOrgApprovalApprove({
        id: opts.id,
        approver: opts.approver,
        coApprover: opts.coApprover,
        operator: opts.operator,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  orgApprovalCmd
    .command("reject")
    .description("Reject internal pending request")
    .requiredOption("--id <id>", "APR-*")
    .requiredOption("--approver <name>", "Approver")
    .option("--reason <text>", "Reason")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runOrgApprovalReject({
        id: opts.id,
        approver: opts.approver,
        reason: opts.reason,
        tenant: opts.tenant,
        json: opts.json,
      })
    );
  orgApprovalCmd
    .command("list")
    .description("List internal approvals")
    .option("--status <status>", "pending_approval | approved | rejected")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runOrgApprovalList({ status: opts.status, tenant: opts.tenant, json: opts.json })
    );
  orgApprovalCmd
    .command("show")
    .description("Show internal approval by id")
    .argument("<id>", "APR-*")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((id, opts) => runOrgApprovalShow({ id, tenant: opts.tenant, json: opts.json }));

  const orgAuditCmd = orgCmd.command("audit").description("Org audit bridge");
  orgAuditCmd
    .command("bridge")
    .description("Mirror operational audit.jsonl entries to protocol audit-chain")
    .option("--since <date>", "YYYY-MM-DD")
    .option("--enable", "Enable bridge in data/org/audit-bridge.yaml")
    .option("--disable", "Disable bridge")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runOrgAuditBridge({
        since: opts.since,
        enable: opts.enable,
        disable: opts.disable,
        tenant: opts.tenant,
        json: opts.json,
      })
    );

  const hubCmd = program.command("hub").description("Witness Hub node (reference implementation)");
  hubCmd
    .command("serve")
    .description("Start witness hub HTTP server")
    .requiredOption("--hub-id <id>", "Hub node id (e.g. HUB-A)")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--host <host>", "Bind host", "127.0.0.1")
    .option("--port <n>", "Bind port", "9474")
    .option("--gossip-interval <sec>", "Background gossip sync interval (requires hub-federation.yaml)")
    .action((opts) =>
      runHubServe({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        host: opts.host,
        port: Number(opts.port),
        gossipIntervalSec: opts.gossipInterval ? Number(opts.gossipInterval) : undefined,
      })
    );
  const hubFederationCmd = hubCmd.command("federation").description("Hub peer federation");
  hubFederationCmd
    .command("show")
    .description("Show hub-federation.yaml")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubFederationShow({ hubId: opts.hubId, dataDir: opts.dataDir, json: opts.json })
    );
  hubFederationCmd
    .command("add-peer")
    .description("Add peer hub to hub-federation.yaml")
    .requiredOption("--hub-id <id>", "Local hub node id")
    .requiredOption("--peer-id <id>", "Peer hub id")
    .requiredOption("--peer-url <url>", "Peer hub base URL")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--public-key <b64>", "Peer hub public key (fetched if omitted)")
    .option("--priority <n>", "Peer priority", "1")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runHubFederationAddPeer({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        peerId: opts.peerId,
        peerUrl: opts.peerUrl,
        publicKey: opts.publicKey,
        priority: Number(opts.priority),
        json: opts.json,
      })
    );
  const hubGossipCmd = hubCmd.command("gossip").description("Hub gossip sync");
  hubGossipCmd
    .command("sync")
    .description("Pull attestations from federation peer(s)")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--peer <id>", "Single peer hub id (default: all peers)")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runHubGossipSync({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        peer: opts.peer,
        json: opts.json,
      })
    );
  hubGossipCmd
    .command("sync-all")
    .description("Pull attestations from all federation peers")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runHubGossipSync({ hubId: opts.hubId, dataDir: opts.dataDir, json: opts.json })
    );
  hubCmd
    .command("export-public-key")
    .description("Export hub Ed25519 public key (base64 SPKI)")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubExportPublicKey({ hubId: opts.hubId, dataDir: opts.dataDir, json: opts.json })
    );
  hubCmd
    .command("verify")
    .description("Verify hub receipt for event_id (local data-dir or remote hub-url)")
    .requiredOption("--hub-id <id>", "Hub node id")
    .requiredOption("--event-id <uuid>", "Event id")
    .option("--data-dir <path>", "Hub data directory (local mode)")
    .option("--hub-url <url>", "Remote hub base URL")
    .option("--public-key <b64>", "Override hub public key")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runHubVerify({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        hubUrl: opts.hubUrl,
        eventId: opts.eventId,
        hubPublicKey: opts.publicKey,
        json: opts.json,
      })
    );
  hubCmd
    .command("anchor-show")
    .description("Show Merkle anchor for hub receipts on date")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--date <YYYY-MM-DD>", "Anchor date")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubAnchorShow({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        date: opts.date,
        json: opts.json,
      })
    );
  hubCmd
    .command("anchor-export")
    .description("Compute and save signed Merkle anchor for receipt digests on date")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--date <YYYY-MM-DD>", "Anchor date")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubAnchorExport({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        date: opts.date,
        json: opts.json,
      })
    );
  hubCmd
    .command("anchor-verify")
    .description("Verify signed Merkle anchor (local or remote)")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory")
    .option("--hub-url <url>", "Remote hub base URL")
    .option("--date <YYYY-MM-DD>", "Anchor date")
    .option("--public-key <b64>", "Override hub public key")
    .option("--json", "JSON output")
    .action(async (opts) =>
      runHubAnchorVerify({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        hubUrl: opts.hubUrl,
        date: opts.date,
        hubPublicKey: opts.publicKey,
        json: opts.json,
      })
    );
  hubCmd
    .command("gossip-export")
    .description("Export gossip snapshot of hub receipts (audit read-only)")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--since <iso>", "Filter receipts since ISO timestamp")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubGossipExport({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        since: opts.since,
        json: opts.json,
      })
    );
  hubCmd
    .command("gossip-attestation-export")
    .description("Export attestations for gossip sync")
    .requiredOption("--hub-id <id>", "Hub node id")
    .option("--data-dir <path>", "Hub data directory", "./data/hub")
    .option("--since <iso>", "Filter since ISO timestamp")
    .option("--json", "JSON output")
    .action((opts) =>
      runHubGossipAttestationExport({
        hubId: opts.hubId,
        dataDir: opts.dataDir,
        since: opts.since,
        json: opts.json,
      })
    );
}
