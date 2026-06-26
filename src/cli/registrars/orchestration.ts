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
import { runComplianceGap } from "../../commands/compliance.js";
import {
  runProtocolValidate,
  runProtocolIdentityExport,
  runProtocolIdentityValidate,
  runProtocolPeerRegister,
  runProtocolDelegationExport,
  runProtocolDelegationValidate,
  runProtocolTransactionRecord,
  runProtocolTransactionList,
  runProtocolTransactionShow,
  runProtocolAuditVerify,
  runProtocolEnvelopeValidate,
  runProtocolNoticePropose,
  runProtocolNoticeList,
  runProtocolNoticeApprove,
  runProtocolNoticeReject,
  runProtocolNoticeShow,
  runProtocolSigningExportPublic,
  runProtocolDeliver,
  runProtocolDeliverFlushPending,
  runProtocolNoticeDraft,
  runProtocolApproversList,
  runProtocolWitnessRegister,
  runProtocolWitnessFlushPending,
  runProtocolWitnessVerify,
  runProtocolWitnessReconcile,
  runProtocolWitnessPoolStatus,
  runProtocolTrustedHubsList,
  runProtocolWitnessPoolInitTrusted,
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

  const protocolDelegationCmd = protocolCmd.command("delegation").description("Authority delegation");
  protocolDelegationCmd
    .command("export")
    .description("Export DelegationProof as EventEnvelope")
    .requiredOption("--scope <scope>", "e.g. contract.sign")
    .requiredOption("--grantee-agent <id>", "Agent id (contract · finance · …)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolDelegationExport({
        scope: opts.scope,
        granteeAgent: opts.granteeAgent,
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
    .description("Operator-proposed inter-org wire (REG-004 approval)");
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
    .option("--co-approver <name>", "Second approver (REG-004 tier B)")
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
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runProtocolAuditVerify({ since: opts.since, tenant: opts.tenant, json: opts.json })
    );

  const protocolSigningCmd = protocolCmd.command("signing").description("Protocol envelope signing");
  protocolSigningCmd
    .command("export-public")
    .description("Export base64 protocol public key for peer registration")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runProtocolSigningExportPublic({ tenant: opts.tenant, json: opts.json }));

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
    .command("approvers")
    .description("List REG-004 authorized approvers from company.yaml")
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
