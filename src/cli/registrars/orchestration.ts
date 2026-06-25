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
}
