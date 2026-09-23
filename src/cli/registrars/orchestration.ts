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
  runEscalateReopen,
} from "../../commands/escalate.js";
import {
  runOrchestrateCancel,
  runOrchestratePlan,
  runOrchestrateRetry,
  runOrchestrateRun,
  runOrchestrateStatus,
} from "../../commands/orchestrate.js";
import {
  runAgentDispatchPlan,
  runAgentDispatchRun,
  runAgentCloudConfig,
  runAgentCloudWatch,
  runAgentReadiness,
  runAgentPulseCommand,
} from "../../commands/agent.js";
import {
  runAgentMissionList,
  runAgentOrder,
  runAgentRelayAck,
  runAgentRelayList,
  runAgentRelaySummary,
  runAgentReport,
} from "../../commands/agent-reporting.js";
import {
  runAgentRosterInit,
  runAgentRosterSet,
  runAgentRosterShow,
  runAgentRosterTask,
  runAgentRosterValidate,
  runAgentRosterInitAll,
  runAgentRosterMigrate,
} from "../../commands/agent-roster.js";
import { runQueuePush, runQueueList, runQueueDrain } from "../../commands/queue.js";
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
import { runComplianceGap } from "../../commands/compliance.js";
import {
  runControlsList,
  runControlsStatus,
  runControlsGap,
  runControlsForAgent,
  runControlsSet,
  runControlsInit,
} from "../../commands/controls.js";
import { runControlsMigrateCore } from "../../commands/controls-migrate-core.js";
import {
  runIsoCatalog,
  runIsoMapsVerify,
  runIsoAuditRun,
  runIsoAuditReport,
  runIsoRoadmap,
} from "../../commands/iso-audit.js";
import { runIsoScaffold } from "../../commands/iso-scaffold.js";
import { runIsoTemplates } from "../../commands/iso-templates.js";
import { runIsoKpi } from "../../commands/iso-kpi.js";
import { runIsoClauses } from "../../commands/iso-clauses.js";
import { runIsoRecordsCheck } from "../../commands/iso-records.js";
import { runIsoRequirements } from "../../commands/iso-requirements.js";
import {
  runIsoAuditApplyPrecheck,
  runIsoAuditBrief,
  runIsoAuditConclude,
  runIsoAuditEligibility,
  runIsoAuditFindingSet,
  runIsoAuditFollowUp,
  runIsoAuditPlanCreate,
  runIsoAuditPlanList,
  runIsoAuditPlanShow,
  runIsoAuditProgramme,
} from "../../commands/iso-audit-plan.js";
import { runIsoAuditSign } from "../../commands/iso-audit-sign.js";
import { registerCanonicalWireCommands } from "./wire.js";
import { registerProtocolCompatibilityCommands } from "./protocol/index.js";
import { registerInternalWebhookCommands } from "./internal-webhook.js";
import {
  runTowerAssign,
  runTowerClassify,
  runTowerInventory,
} from "../../commands/tower.js";

export function registerOrchestrationCommands(program: Command): void {
  const routeCmd = program.command("route").description("Agent inter-routing (registry · access · handoff)");
  routeCmd.command("list").description("List static route registry").action(runRouteList);
  routeCmd
    .command("match")
    .description("Match routes by --text and/or --path")
    .option("--text <text>", "User intent or message text")
    .option("--path <path>", "Resource path (logical)")
    .option("--profile <profile>", "operational | developer | task", "operational")
    .option("--json", "JSON output")
    .action((opts) =>
      runRouteMatch({
        text: opts.text,
        path: opts.path,
        profile: opts.profile,
        json: opts.json,
      })
    );
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
    .option("--profile <profile>", "operational | developer | task", "operational")
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
        profile: opts.profile,
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
    .option("--profile <profile>", "operational | developer | task", "operational")
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
        profile: opts.profile,
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
    .command("reopen")
    .description("Reopen a completed work order (returns to pending)")
    .requiredOption("--id <id>", "Work order id (IMP-...)")
    .action((opts) => runEscalateReopen({ id: opts.id }));
  escalateCmd
    .command("merge")
    .description("Merge completed work order results into executive-notes")
    .requiredOption("--id <id>", "Parent or child IMP id")
    .option("--output <filename>", "Output filename under executive-notes/")
    .option("--auto-complete", "Mark parent completed when all children done")
    .action((opts) =>
      runEscalateMerge({ id: opts.id, output: opts.output, autoComplete: opts.autoComplete })
    );

  const orchestrateCmd = program.command("orchestrate").description("Executive Steward work order DAG orchestration");
  orchestrateCmd
    .command("plan")
    .description("Plan multi-agent work orders + optional DAG dependencies (dry-run default)")
    .option("--text <text>", "Request or structured escalation input")
    .option("--path <path>", "Resource path for route match")
    .option("--subject <text>", "Work order subject")
    .option("--background <text>", "Background context")
    .option("--requirements <text>", "Implementation requirements")
    .option("--deliverable <d>", "Deliverable (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--acceptance <c>", "Acceptance criterion (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--priority <p>", "P0 | P1 | P2 | P3")
    .option("--depends <spec>", "Dependency CHILD:PARENT (repeatable)", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--propose", "P1: propose plan with validation envelope (dry-run)")
    .option("--write", "Create work orders and persist --depends (requires escalate:run)")
    .option("--tenant <id>", "Tenant id")
    .option("--dry-run", "Plan only (default)", true)
    .option("--json", "JSON output")
    .action((opts) =>
      runOrchestratePlan({
        text: opts.text,
        path: opts.path,
        subject: opts.subject,
        background: opts.background,
        requirements: opts.requirements,
        deliverables: opts.deliverable,
        acceptance: opts.acceptance,
        priority: opts.priority,
        depends: opts.depends,
        tenant: opts.tenant,
        dryRun: opts.dryRun,
        write: opts.write,
        propose: opts.propose,
        json: opts.json,
      })
    );
  orchestrateCmd
    .command("run")
    .description("Create (optional) and execute work orders in dependency wave order")
    .option("--id <id>", "Existing parent or child IMP id")
    .option("--text <text>", "Create plan from text when --id omitted")
    .option("--path <path>", "Resource path")
    .option("--subject <text>", "Subject")
    .option("--background <text>", "Background")
    .option("--requirements <text>", "Requirements")
    .option("--deliverable <d>", "Deliverable", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--acceptance <c>", "Acceptance criterion", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--priority <p>", "P0 | P1 | P2 | P3")
    .option("--depends <spec>", "Dependency CHILD:PARENT", (v: string, prev: string[]) => [...prev, v], [] as string[])
    .option("--from <agent>", "Source agent", "executive_steward")
    .option("--parallel <n>", "Max parallel agents per wave", "3")
    .option("--runtime <mode>", "local | cloud | manifest")
    .option("--wave <n>", "Run only wave N (1-indexed); omit for all waves")
    .option("--retry-failed", "Retry failed nodes before dispatch")
    .option("--dry-run", "Plan manifest only")
    .option("--tenant <id>", "Tenant id")
    .action(async (opts) =>
      runOrchestrateRun({
        id: opts.id,
        text: opts.text,
        path: opts.path,
        subject: opts.subject,
        background: opts.background,
        requirements: opts.requirements,
        deliverables: opts.deliverable,
        acceptance: opts.acceptance,
        priority: opts.priority,
        depends: opts.depends,
        from: opts.from,
        parallel: opts.parallel ? Number(opts.parallel) : undefined,
        runtime: opts.runtime,
        wave: opts.wave ? Number(opts.wave) : undefined,
        retryFailed: opts.retryFailed,
        dryRun: opts.dryRun,
        tenant: opts.tenant,
      })
    );
  orchestrateCmd
    .command("status")
    .description("Show DAG, status, attempts, and trace for a plan")
    .requiredOption("--id <id>", "Parent or child IMP id")
    .option("--json", "JSON output")
    .action((opts) => runOrchestrateStatus({ id: opts.id, json: opts.json }));
  orchestrateCmd
    .command("retry")
    .description("Reset retryable failed work orders to pending")
    .requiredOption("--id <id>", "Parent or child IMP id")
    .action((opts) => runOrchestrateRetry({ id: opts.id }));
  orchestrateCmd
    .command("cancel")
    .description("Block pending/waiting work orders in a plan")
    .requiredOption("--id <id>", "Parent or child IMP id")
    .action((opts) => runOrchestrateCancel({ id: opts.id }));

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
  agentCmd
    .command("implement")
    .description("Execute work order via portable runtime (LLM / shell / manifest)")
    .requiredOption("--id <id>", "Work order id (IMP-...)")
    .option("--profile <name>", "Shell profile (aider | cline | openhands)")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runAgentImplement } = await import("../../commands/agent.js");
      await runAgentImplement({ id: opts.id, profile: opts.profile, json: opts.json });
    });

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

  agentCmd
    .command("readiness")
    .description("Agent completion score (7 axes · target 80%+)")
    .option("--tenant <id>", "Tenant id")
    .option("--agent <id>", "Single agent id")
    .option("--min <n>", "Exit 1 if any agent below n%")
    .option("--json", "JSON output")
    .action((opts) =>
      runAgentReadiness({
        tenant: opts.tenant,
        agent: opts.agent,
        json: opts.json,
        min: opts.min ? Number(opts.min) : undefined,
      })
    );
  agentCmd
    .command("pulse")
    .description("Write agent readiness summary to agent-summaries/")
    .option("--tenant <id>", "Tenant id")
    .option("--agent <id>", "Single agent id")
    .option("--all", "All registry agents")
    .option("--extensions", "Extension agents only (dashboard sync)")
    .option("--suffix <text>", "Filename suffix", "pulse")
    .action((opts) =>
      runAgentPulseCommand({
        tenant: opts.tenant,
        agent: opts.agent,
        all: opts.all,
        extensions: opts.extensions,
        suffix: opts.suffix,
      })
    );

  const agentRosterCmd = agentCmd.command("roster").description("Tenant Agent activation roster");
  agentRosterCmd
    .command("show")
    .description("Show configured and effective Agent roster")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runAgentRosterShow({ tenant: opts.tenant, json: opts.json }));
  agentRosterCmd
    .command("init")
    .description("Initialize data/operator/agents.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--force", "Replace the existing roster")
    .option("--json", "JSON output")
    .action((opts) =>
      runAgentRosterInit({ tenant: opts.tenant, force: opts.force, json: opts.json })
    );
  agentRosterCmd
    .command("enable")
    .description("Enable an Agent in a tenant profile")
    .requiredOption("--agent <id>", "Agent id")
    .option("--profile <profile>", "operational | developer | task", "operational")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runAgentRosterSet(true, opts));
  agentRosterCmd
    .command("disable")
    .description("Disable a non-required Agent")
    .requiredOption("--agent <id>", "Agent id")
    .option("--profile <profile>", "operational | developer | task", "operational")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runAgentRosterSet(false, opts));
  agentRosterCmd
    .command("validate")
    .description("Validate roster and module bindings")
    .option("--tenant <id>", "Tenant id")
    .option("--sync-modules", "Apply enabled module bindings")
    .option("--json", "JSON output")
    .action((opts) =>
      runAgentRosterValidate({
        tenant: opts.tenant,
        syncModules: opts.syncModules,
        json: opts.json,
      })
    );
  agentRosterCmd
    .command("init-all")
    .description("Bootstrap data/operator/agents.yaml for tenants missing roster files")
    .option("--tenant <id>", "Ignored — operates on all tenants")
    .option("--force", "Overwrite existing agents.yaml")
    .option("--dry-run", "List tenants missing agents.yaml only")
    .option("--json", "JSON output")
    .action((opts) =>
      runAgentRosterInitAll({
        force: opts.force,
        dryRun: opts.dryRun,
        json: opts.json,
      })
    );
  agentRosterCmd
    .command("task")
    .description("Set ephemeral task-profile agents (empty list falls back to operational)")
    .option("--agents <ids>", "Comma-separated Agent ids")
    .option("--clear", "Clear task profile")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runAgentRosterTask({
        tenant: opts.tenant,
        agents: opts.agents,
        clear: opts.clear,
        json: opts.json,
      })
    );
  agentRosterCmd
    .command("migrate")
    .description("Migrate legacy agents-enabled.yaml to agents.yaml")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runAgentRosterMigrate({ tenant: opts.tenant, json: opts.json }));

  agentCmd
    .command("order")
    .description("Issue field-agent mission (COO → Steward reporting chain)")
    .requiredOption("--to <agent>", "Target field agent id")
    .requiredOption("--subject <text>", "Mission subject")
    .option("--from <actor>", "Ordering actor", "executive_steward")
    .option("--requirements <text>", "Requirements / context")
    .option("--work-order <id>", "Linked IMP work order id")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runAgentOrder({
        tenant: opts.tenant,
        to: opts.to,
        subject: opts.subject,
        from: opts.from,
        requirements: opts.requirements,
        workOrder: opts.workOrder,
        json: opts.json,
      })
    );

  agentCmd
    .command("report")
    .description("Submit field-agent execution report (relays via COO)")
    .requiredOption("--agent <id>", "Reporting field agent id")
    .requiredOption("--summary <text>", "Report summary")
    .option("--mission <id>", "Existing MS mission id")
    .option("--path <file>", "Summary artifact path")
    .option("--subject <text>", "Subject when creating ad-hoc mission")
    .option("--no-auto-forward", "Keep COO relay pending (no auto-forward)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runAgentReport({
        tenant: opts.tenant,
        agent: opts.agent,
        summary: opts.summary,
        mission: opts.mission,
        path: opts.path,
        subject: opts.subject,
        noAutoForward: opts.noAutoForward,
        json: opts.json,
      })
    );

  const agentRelayCmd = agentCmd.command("relay").description("COO / Steward reporting inbox");
  agentRelayCmd
    .command("list")
    .description("List pending relay items")
    .requiredOption("--role <role>", "coo | steward")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runAgentRelayList({ tenant: opts.tenant, role: opts.role, json: opts.json }));
  agentRelayCmd
    .command("ack")
    .description("Acknowledge relay leg")
    .requiredOption("--mission <id>", "MS mission id")
    .requiredOption("--role <role>", "coo | steward")
    .option("--notes <text>", "Ack notes")
    .option("--no-forward", "COO ack without forwarding to Steward")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runAgentRelayAck({
        tenant: opts.tenant,
        mission: opts.mission,
        role: opts.role,
        notes: opts.notes,
        noForward: opts.noForward,
        json: opts.json,
      })
    );
  agentRelayCmd.command("summary").description("Markdown inbox summary").action(() => runAgentRelaySummary());

  agentCmd
    .command("missions")
    .description("List agent missions (MS-*)")
    .option("--tenant <id>", "Tenant id")
    .option("--agent <id>", "Filter by field agent")
    .option("--json", "JSON output")
    .action((opts) => runAgentMissionList({ tenant: opts.tenant, agent: opts.agent, json: opts.json }));

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

  registerInternalWebhookCommands(program);

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

  const controlsCmd = program.command("controls").description("ISO × REG control framework");
  controlsCmd
    .command("list")
    .description("List in-scope controls for active tenant")
    .option("--tenant <id>", "Tenant id")
    .option("--iso <id>", "Filter by ISO standard (e.g. ISO-9001)")
    .option("--agent <id>", "Filter by agent id")
    .option("--json", "JSON output")
    .action((opts) =>
      runControlsList({
        tenant: opts.tenant,
        iso: opts.iso,
        agent: opts.agent,
        json: opts.json,
      })
    );
  controlsCmd
    .command("status")
    .description("Control maturity summary")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) => runControlsStatus({ tenant: opts.tenant, json: opts.json }));
  controlsCmd
    .command("gap")
    .description("Control gaps (maturity · evidence · REG)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .option("--no-strict", "Do not exit 1 when gaps exist")
    .action((opts) =>
      runControlsGap({
        tenant: opts.tenant,
        json: opts.json,
        strict: opts.strict !== false,
      })
    );
  controlsCmd
    .command("for-agent <agentId>")
    .description("Controls owned by an agent (delegation)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((agentId, opts) =>
      runControlsForAgent(agentId, { tenant: opts.tenant, json: opts.json })
    );
  controlsCmd
    .command("set")
    .description("Set control maturity for tenant")
    .requiredOption("--id <controlId>", "Control id (CTL-...)")
    .requiredOption("--maturity <level>", "L0–L4")
    .option("--notes <text>", "Review notes")
    .option("--tenant <id>", "Tenant id")
    .action((opts) =>
      runControlsSet({
        tenant: opts.tenant,
        id: opts.id,
        maturity: opts.maturity,
        notes: opts.notes,
      })
    );
  controlsCmd
    .command("init")
    .description("Initialize tenant controls.yaml from enabled ISO maps")
    .option("--tenant <id>", "Tenant id")
    .option("--dry-run", "Print path only")
    .action((opts) => runControlsInit({ tenant: opts.tenant, dryRun: opts.dryRun }));
  controlsCmd
    .command("migrate-core")
    .description("Fold superseded per-standard controls into CTL-CORE-* (keeps maturity)")
    .option("--tenant <id>", "Tenant id")
    .option("--write", "Apply the migration (default is dry-run)")
    .option("--json", "JSON output")
    .action((opts) =>
      runControlsMigrateCore({ tenant: opts.tenant, write: opts.write, json: opts.json })
    );

  const isoCmd = program
    .command("iso")
    .description("ISO catalog · machine-readable maps · internal audit");
  isoCmd
    .command("catalog")
    .description("List ISO pack catalog and control-map load status")
    .option("--status <status>", "Filter: available | coming_soon")
    .option("--json", "JSON output")
    .action((opts) => runIsoCatalog({ status: opts.status, json: opts.json }));
  isoCmd
    .command("roadmap")
    .description("List coming_soon standards by tier")
    .option("--tier <tier>", "1 | 2 | 3 | 4")
    .option("--json", "JSON output")
    .action((opts) => runIsoRoadmap({ tier: opts.tier, json: opts.json }));
  isoCmd
    .command("scaffold <id>")
    .description("Promote a coming_soon standard to a pack shell (core_bindings + index)")
    .option("--dry-run", "Print the scaffold without writing")
    .option("--json", "JSON output")
    .action((id, opts) => runIsoScaffold(id, { dryRun: opts.dryRun, json: opts.json }));
  isoCmd
    .command("templates <id>")
    .description("Copy a pack's blank evidence forms into the tenant (never overwrites)")
    .option("--tenant <id>", "Tenant id")
    .option("--write", "Write the forms")
    .option("--json", "JSON output")
    .action((id, opts) =>
      runIsoTemplates(id, { tenant: opts.tenant, write: opts.write, json: opts.json })
    );
  isoCmd
    .command("clauses")
    .description("List clause references and whether they were checked against the standard text")
    .option("--tenant <id>", "Tenant id")
    .option("--iso <id>", "Limit to one standard")
    .option("--json", "JSON output")
    .action((opts) => runIsoClauses({ tenant: opts.tenant, iso: opts.iso, json: opts.json }));
  isoCmd
    .command("kpi")
    .description("Check the ISO 21401 KPI log and compute per-guest-night intensity")
    .option("--tenant <id>", "Tenant id")
    .option("--strict", "Exit 1 when the log has faults")
    .option("--json", "JSON output")
    .action((opts) => runIsoKpi({ tenant: opts.tenant, strict: opts.strict, json: opts.json }));
  isoCmd
    .command("requirements")
    .description("Check requirement-to-control coverage in both directions")
    .option("--tenant <id>", "Tenant id")
    .option("--iso <id>", "Limit to one standard")
    .option("--unverified", "List requirements whose wording is unchecked")
    .option("--strict", "Exit 1 on uncovered or dangling requirements")
    .option("--json", "JSON output")
    .action((opts) =>
      runIsoRequirements({
        tenant: opts.tenant,
        iso: opts.iso,
        unverified: opts.unverified,
        strict: opts.strict,
        json: opts.json,
      })
    );
  const isoRecordsCmd = isoCmd
    .command("records")
    .description("Check tenant records against the pack's record specification");
  isoRecordsCmd
    .command("check")
    .description("Evaluate every record declared in records.yaml (exit 1 with --strict)")
    .option("--tenant <id>", "Tenant id")
    .option("--iso <id>", "Limit to one standard")
    .option("--strict", "Exit 1 when a record has faults")
    .option("--json", "JSON output")
    .action((opts) =>
      runIsoRecordsCheck({
        tenant: opts.tenant,
        iso: opts.iso,
        strict: opts.strict,
        json: opts.json,
      })
    );
  isoCmd
    .command("maps")
    .description("ISO control-map verification")
    .command("verify")
    .description("Parse every catalog control-map (exit 1 on failure)")
    .option("--json", "JSON output")
    .action((opts) => runIsoMapsVerify({ json: opts.json }));
  const isoAuditCmd = isoCmd
    .command("audit")
    .description("ISO internal audit — deterministic pre-check (run) and ISO 19011 audit (plan)");
  isoAuditCmd
    .command("run")
    .description("Pre-check: evaluate enabled ISO maps and evidence. Not an internal audit by itself")
    .option("--tenant <id>", "Tenant id")
    .option("--iso <id>", "Limit to one standard (e.g. ISO-9001)")
    .option("--dry-run", "Evaluate without writing log or reports")
    .option("--strict", "Exit 1 when overall is nonconform")
    .option("--json", "JSON output")
    .action((opts) =>
      runIsoAuditRun({
        tenant: opts.tenant,
        iso: opts.iso,
        dryRun: opts.dryRun,
        strict: opts.strict,
        json: opts.json,
      })
    );
  const isoAuditPlanCmd = isoAuditCmd
    .command("plan")
    .description("ISO 19011 audit plans — scope, criteria, auditor, period");
  isoAuditPlanCmd
    .command("create")
    .description("Create an audit plan (refuses an auditor who lacks independence or competence)")
    .option("--tenant <id>", "Tenant id")
    .option("--iso <id>", "Standard to audit")
    .option("--auditor <operator-id>", "Auditor operator id")
    .option("--period <range>", "YYYY-MM..YYYY-MM")
    .option("--scope <ids>", "Comma-separated control ids (default: all in-scope)")
    .option("--criteria <refs>", "Comma-separated audit criteria")
    .option("--sampling <text>", "Sampling policy")
    .option("--precheck-run-id <id>", "iso audit run id attached as input")
    .option("--framework <name>", "iso | financial | jsox (default iso)")
    .option("--operator-id <id>", "Operator recording the plan")
    .option("--force", "Record despite an eligibility failure")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditPlanCreate(opts));
  isoAuditPlanCmd
    .command("list")
    .description("List audit plans and judgement progress")
    .option("--tenant <id>", "Tenant id")
    .option("--iso <id>", "Limit to one standard")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditPlanList(opts));
  isoAuditPlanCmd
    .command("show")
    .description("Print one audit plan with its findings")
    .option("--tenant <id>", "Tenant id")
    .option("--plan <id>", "Plan id (IAP-...)")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditPlanShow(opts));
  const isoAuditFindingCmd = isoAuditCmd
    .command("finding")
    .description("Auditor judgements, one requirement at a time");
  isoAuditFindingCmd
    .command("set")
    .description("Record the auditor's verdict on one requirement")
    .option("--tenant <id>", "Tenant id")
    .option("--plan <id>", "Plan id (IAP-...)")
    .option("--req <id>", "Requirement id (REQ-...)")
    .option("--verdict <v>", "conform | nonconform_minor | nonconform_major | observation | not_applicable")
    .option("--evidence <path...>", "Evidence path the auditor examined")
    .option("--sample <text>", "What was sampled, and how much")
    .option("--note <text>", "Auditor's own description (required for nonconformity)")
    .option("--operator-id <id>", "Auditor operator id")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditFindingSet(opts));
  isoAuditCmd
    .command("conclude")
    .description("Close an audit (refuses while any requirement is unjudged)")
    .option("--tenant <id>", "Tenant id")
    .option("--plan <id>", "Plan id (IAP-...)")
    .option("--summary <text>", "Audit conclusion")
    .option("--operator-id <id>", "Auditor operator id")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditConclude(opts));
  isoAuditCmd
    .command("sign")
    .description("Sign a concluded audit via org approval (human ceo/approver only)")
    .option("--tenant <id>", "Tenant id")
    .option("--plan <id>", "Plan id (IAP-...)")
    .option("--approver <name>", "Approver name to record")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditSign(opts));
  isoAuditCmd
    .command("eligibility")
    .description("Check an auditor's independence and competence before planning")
    .option("--tenant <id>", "Tenant id")
    .option("--iso <id>", "Standard to audit")
    .option("--auditor <operator-id>", "Auditor operator id")
    .option("--scope <ids>", "Comma-separated control ids")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditEligibility(opts));
  isoAuditCmd
    .command("programme")
    .description("Check whether every requirement was audited within the window")
    .option("--tenant <id>", "Tenant id")
    .option("--iso <id>", "Standard")
    .option("--framework <name>", "iso | financial | jsox")
    .option("--months <n>", "Window in months (default 12)")
    .option("--strict", "Exit 1 when a requirement was never audited")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditProgramme(opts));
  isoAuditCmd
    .command("apply-precheck")
    .description("Propose findings from A+B pre-check (does not set major or not_applicable)")
    .option("--tenant <id>", "Tenant id")
    .option("--plan <id>", "Plan id (IAP-...)")
    .option("--operator-id <id>", "Auditor operator id")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditApplyPrecheck(opts));
  isoAuditCmd
    .command("brief")
    .description("Explain one requirement from paraphrase + pre-check gaps (does not judge)")
    .option("--tenant <id>", "Tenant id")
    .option("--plan <id>", "Plan id (IAP-...)")
    .option("--req <id>", "Requirement id (REQ-...)")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditBrief(opts));
  isoAuditCmd
    .command("follow-up")
    .description("Follow up nonconformities and corrective-action effectiveness")
    .option("--tenant <id>", "Tenant id")
    .option("--plan <id>", "Plan id (IAP-...)")
    .option("--json", "JSON output")
    .action((opts) => runIsoAuditFollowUp(opts));
  isoAuditCmd
    .command("report")
    .description("Print management report from the latest (or --run-id) pre-check log")
    .option("--tenant <id>", "Tenant id")
    .option("--run-id <id>", "Audit run id (IAR-...)")
    .option("--json", "JSON output")
    .action((opts) =>
      runIsoAuditReport({ tenant: opts.tenant, runId: opts.runId, json: opts.json })
    );

  registerProtocolCompatibilityCommands(program);

  const governanceCmd = program
    .command("governance")
    .description("ISO 37000 governance principles (self-declaration, not certification)");
  const gpCmd = governanceCmd
    .command("principles")
    .description("ISO 37000:2021 eleven principles · evidence status");
  gpCmd
    .command("status")
    .description("Assess ISO 37000 self-declaration readiness")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGovernancePrinciplesStatus } = await import("../../commands/governance-principles.js");
      runGovernancePrinciplesStatus({ tenant: opts.tenant, json: opts.json });
    });
  gpCmd
    .command("init")
    .description("Write ISO 37000 self-declaration draft (purpose + applicability)")
    .option("--tenant <id>", "Tenant id")
    .option("--force", "Overwrite existing declaration YAML")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGovernancePrinciplesInit } = await import("../../commands/governance-principles.js");
      runGovernancePrinciplesInit({ tenant: opts.tenant, force: opts.force, json: opts.json });
    });
  gpCmd
    .command("declare")
    .description("Human sign-off: mark self_declared when status is ready")
    .requiredOption("--signatory <name>", "Signatory name")
    .option("--role <role>", "Signatory role", "代表取締役")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runGovernancePrinciplesDeclare } = await import("../../commands/governance-principles.js");
      runGovernancePrinciplesDeclare({
        tenant: opts.tenant,
        signatory: opts.signatory,
        role: opts.role,
        json: opts.json,
      });
    });

  const orgCmd = program.command("org").description("Universal org activity root (approval · audit bridge)");
  const orgChartCmd = orgCmd.command("chart").description("Org chart (OCH proposals)");
  const orgChartChangeCmd = orgChartCmd.command("change").description("Org chart change proposals");
  orgChartChangeCmd
    .command("validate")
    .description("Validate OCH proposal file(s)")
    .option("--file <path>", "Single proposal YAML")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOrgChartChangeValidate } = await import("../../commands/org-chart-change.js");
      runOrgChartChangeValidate({ file: opts.file, json: opts.json });
    });
  orgChartChangeCmd
    .command("propose")
    .description("Record an OCH proposal from an intent YAML (no chart mutation)")
    .requiredOption("--file <path>", "Change input YAML (intent · action · node)")
    .requiredOption("--approval <id>", "APR id from `org approval propose`")
    .requiredOption("--operator <id>", "Operator proposing the change")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOrgChartChangePropose } = await import("../../commands/org-chart-change.js");
      runOrgChartChangePropose({
        file: opts.file,
        approval: opts.approval,
        operator: opts.operator,
        json: opts.json,
      });
    });
  orgChartChangeCmd
    .command("apply")
    .description("Apply approved OCH proposal to org-chart.yaml")
    .requiredOption("--file <path>", "Proposal YAML")
    .requiredOption("--operator <id>", "Operator applying the change")
    .option("--dry-run", "Compute hashes without writing")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runOrgChartChangeApply } = await import("../../commands/org-chart-change.js");
      runOrgChartChangeApply({
        file: opts.file,
        operator: opts.operator,
        dryRun: Boolean(opts.dryRun),
        json: opts.json,
      });
    });

  const workflowCmd = program
    .command("workflow")
    .description("Workflow canvas SSOT · evaluate · WFS structure proposals");
  workflowCmd
    .command("list")
    .description("List workflows under data/org/workflows/")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runWorkflowList } = await import("../../commands/workflow.js");
      runWorkflowList({ json: opts.json });
    });
  workflowCmd
    .command("get")
    .description("Load a workflow SSOT YAML")
    .requiredOption("--id <workflow_id>", "Workflow id (e.g. WF-system-map)")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runWorkflowGet } = await import("../../commands/workflow.js");
      runWorkflowGet({ id: opts.id, json: opts.json });
    });
  workflowCmd
    .command("render")
    .description("Project SSOT to json | table | mermaid (read-only)")
    .requiredOption("--id <workflow_id>", "Workflow id (e.g. WF-system-map)")
    .requiredOption("--format <format>", "json | table | mermaid")
    .action(async (opts) => {
      const format = String(opts.format).toLowerCase();
      if (format !== "json" && format !== "table" && format !== "mermaid") {
        console.error("--format must be json, table, or mermaid");
        process.exitCode = 1;
        return;
      }
      const { runWorkflowRender } = await import("../../commands/workflow.js");
      runWorkflowRender({ id: opts.id, format });
    });
  workflowCmd
    .command("evaluate")
    .description("Deterministic evaluate of a draft (no YAML write)")
    .option("--file <path>", "Draft YAML or JSON")
    .option("--id <workflow_id>", "Evaluate existing SSOT")
    .option("--llm-file <path>", "Optional LLM proposal overlay (fixture / model output)")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runWorkflowEvaluate } = await import("../../commands/workflow.js");
      runWorkflowEvaluate({
        file: opts.file,
        id: opts.id,
        llmFile: opts.llmFile,
        json: opts.json,
      });
    });
  const workflowChangeCmd = workflowCmd
    .command("change")
    .description("Workflow structure change proposals (WFS)");
  workflowChangeCmd
    .command("validate")
    .description("Validate WFS proposal file(s)")
    .option("--file <path>", "Single proposal YAML")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runWorkflowChangeValidate } = await import("../../commands/workflow.js");
      runWorkflowChangeValidate({ file: opts.file, json: opts.json });
    });
  workflowChangeCmd
    .command("propose")
    .description("Record a WFS proposal (no SSOT mutation)")
    .requiredOption("--file <path>", "Change input YAML (draft · proposed · findings)")
    .requiredOption("--approval <id>", "APR id from `org approval propose`")
    .requiredOption("--operator <id>", "Operator proposing the change")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runWorkflowChangePropose } = await import("../../commands/workflow.js");
      runWorkflowChangePropose({
        file: opts.file,
        approval: opts.approval,
        operator: opts.operator,
        json: opts.json,
      });
    });
  workflowChangeCmd
    .command("apply")
    .description("Apply approved WFS proposal to data/org/workflows/")
    .requiredOption("--file <path>", "Proposal YAML")
    .requiredOption("--operator <id>", "Operator applying the change")
    .option("--dry-run", "Compute hashes without writing")
    .option("--json", "JSON output")
    .action(async (opts) => {
      const { runWorkflowChangeApply } = await import("../../commands/workflow.js");
      runWorkflowChangeApply({
        file: opts.file,
        operator: opts.operator,
        dryRun: Boolean(opts.dryRun),
        json: opts.json,
      });
    });
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
    .option("--reviewed", "Confirm correspondence draft body was reviewed (required for correspondence.*)")
    .option("--tenant <id>", "Tenant id")
    .option("--json", "JSON output")
    .action((opts) =>
      runOrgApprovalApprove({
        id: opts.id,
        approver: opts.approver,
        coApprover: opts.coApprover,
        operator: opts.operator,
        tenant: opts.tenant,
        reviewed: opts.reviewed,
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

  const towerCmd = program
    .command("tower")
    .description("Dispatch Tower — classify · inventory · human/AIA assign (ADR 0057)");
  towerCmd
    .command("classify")
    .description("Deterministic work_kind classification")
    .requiredOption("--text <text>", "CEO chat message")
    .option("--json", "JSON output")
    .action((opts) => runTowerClassify({ text: opts.text, json: opts.json }));
  towerCmd
    .command("inventory")
    .description("AIA roster/runtime and human capacity load")
    .option("--json", "JSON output")
    .action((opts) => runTowerInventory({ json: opts.json }));
  towerCmd
    .command("assign")
    .description("Confirm tower plan and create work order")
    .requiredOption("--plan-id <id>", "tower plan id from chat card")
    .option("--confirmed", "Required to execute assign")
    .option("--assignee-employee-id <id>", "Override human assignee")
    .option("--due-date <date>", "YYYY-MM-DD override")
    .option("--json", "JSON output")
    .action((opts) =>
      runTowerAssign({
        planId: opts.planId,
        confirmed: opts.confirmed,
        assigneeEmployeeId: opts.assigneeEmployeeId,
        dueDate: opts.dueDate,
        json: opts.json,
      })
    );

  registerCanonicalWireCommands(program);
}
