import type { EscalationInput } from "../../schemas/routing.js";
import {
  buildDispatchManifest,
  formatDispatchPlan,
  runDispatch,
  type DispatchRuntime,
} from "../lib/agent-dispatch.js";
import {
  formatPlanOutput,
  parseEscalationText,
  planWorkOrders,
  runEscalation,
} from "../lib/escalate.js";
import {
  applyDependsToWorkOrders,
  buildOrchestrationStatusPayload,
  cancelPendingWorkOrders,
  formatOrchestrationStatus,
  retryFailedWorkOrders,
} from "../lib/orchestration/orchestrate-actions.js";
import { parseDependsSpec, resolvePlanRoot } from "../lib/orchestration/plan-graph.js";
import { proposeOrchestrationPlan } from "../lib/orchestration/llm-planner.js";
import { setTenantId } from "../lib/tenant.js";
import { auditCliMutation, requireCliOperator } from "../lib/console-auth/cli-operator.js";

export interface OrchestratePlanOptions {
  text?: string;
  path?: string;
  subject?: string;
  background?: string;
  requirements?: string;
  deliverables?: string[];
  acceptance?: string[];
  priority?: string;
  tenant?: string;
  depends?: string[];
  dryRun?: boolean;
  write?: boolean;
  propose?: boolean;
  json?: boolean;
}

function buildInput(opts: OrchestratePlanOptions): EscalationInput {
  if (opts.text && !opts.subject && !opts.requirements) {
    const parsed = parseEscalationText(opts.text);
    return {
      ...parsed,
      path: opts.path ?? parsed.path,
      deliverables: opts.deliverables,
      acceptance_criteria: opts.acceptance,
      tenant: opts.tenant,
    };
  }
  return {
    subject: opts.subject,
    background: opts.background,
    requirements: opts.requirements ?? opts.text,
    text: opts.text,
    path: opts.path,
    deliverables: opts.deliverables,
    acceptance_criteria: opts.acceptance,
    priority: opts.priority as EscalationInput["priority"],
    tenant: opts.tenant,
  };
}

export function runOrchestratePlan(opts: OrchestratePlanOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const permission = opts.write ? "escalate:run" : "escalate:plan";
  requireCliOperator({ permission, command: "orchestrate plan" });
  if (!opts.text && !opts.requirements && !opts.subject) {
    console.error("Provide --text and/or --subject / --requirements");
    process.exit(1);
  }

  const input = buildInput(opts);

  if (opts.propose) {
    const proposal = proposeOrchestrationPlan(input);
    if (opts.json) {
      console.log(JSON.stringify(proposal, null, 2));
    } else {
      console.log(formatPlanOutput(proposal.plan, true));
      console.log(`\nProposed via ${proposal.source}`);
      if (proposal.critique) {
        console.log(`\nCritique: ${proposal.critique}`);
      }
      if (proposal.validation.issues.length) {
        console.log("\nValidation issues:");
        for (const issue of proposal.validation.issues) {
          console.log(`- ${issue}`);
        }
      }
    }
    if (!proposal.validation.ok) process.exit(1);
    return;
  }

  if (opts.write) {
    const result = runEscalation({
      fromAgent: "executive_steward",
      input,
      tenant: opts.tenant,
    });
    let targetId = result.parent?.id ?? result.workOrders[0]?.id;
    if (!targetId) {
      console.error("No work orders created");
      process.exit(1);
    }
    if (opts.depends?.length) {
      const depends = parseDependsSpec(opts.depends);
      applyDependsToWorkOrders(resolvePlanRoot(targetId), depends);
    }
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            plan: result.plan,
            rootId: targetId,
            workOrderIds: result.workOrders.map((wo) => wo.id),
            depends: opts.depends ?? [],
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(formatPlanOutput(result.plan, false));
    console.log(`\nCreated plan ${targetId}`);
    if (opts.depends?.length) {
      console.log("\n## Dependencies applied\n");
      for (const spec of opts.depends) {
        console.log(`- ${spec}`);
      }
    }
    if (result.plan.agents.length === 0) process.exit(1);
    return;
  }

  const plan = planWorkOrders(input);

  if (opts.json) {
    console.log(JSON.stringify({ plan, dryRun: opts.dryRun ?? true }, null, 2));
    return;
  }

  console.log(formatPlanOutput(plan, opts.dryRun ?? true));

  if (opts.depends?.length) {
    console.log("\n## Dependency spec (dry-run)\n");
    for (const spec of opts.depends) {
      console.log(`- ${spec}`);
    }
    console.log("\nPersist with `orchestrate plan --write --depends ...` or `orchestrate run --depends ...`.");
  }

  if (plan.agents.length === 0) process.exit(1);
}

export interface OrchestrateRunOptions extends OrchestratePlanOptions {
  id?: string;
  from?: string;
  parallel?: number;
  runtime?: DispatchRuntime;
  wave?: number;
  retryFailed?: boolean;
}

export async function runOrchestrateRun(opts: OrchestrateRunOptions): Promise<void> {
  if (opts.tenant) setTenantId(opts.tenant);
  requireCliOperator({ permission: "agent:dispatch", command: "orchestrate run" });

  let targetId = opts.id;
  if (!targetId) {
    const input = buildInput(opts);
    const result = runEscalation({
      fromAgent: opts.from ?? "executive_steward",
      input,
      tenant: opts.tenant,
    });
    if (result.parent) targetId = result.parent.id;
    else if (result.workOrders.length === 1) targetId = result.workOrders[0]!.id;
    else if (result.workOrders.length > 1) {
      targetId = result.workOrders.find((wo) => wo.child_ids?.length)?.id;
    }
    if (!targetId) {
      console.error("No work orders created");
      process.exit(1);
    }
    if (opts.depends?.length) {
      const depends = parseDependsSpec(opts.depends);
      applyDependsToWorkOrders(resolvePlanRoot(targetId), depends);
    }
    console.log(`Created plan ${targetId}`);
  }

  const result = await runDispatch(targetId, {
    parallel: opts.parallel,
    runtime: opts.runtime,
    dryRun: opts.dryRun,
    wave: opts.wave,
    retryFailed: opts.retryFailed,
  });

  auditCliMutation("orchestrate run", targetId, `${result.results.length} tasks`);

  if (opts.dryRun) {
    console.log(formatDispatchPlan(result.manifest));
    return;
  }

  console.log(`✓ Dispatch ${result.manifest.id} · trace ${result.trace_id}`);
  for (const row of result.results) {
    console.log(`${row.ok ? "✓" : "✗"} ${row.work_order_id}: ${row.detail}`);
  }
}

export interface OrchestrateStatusOptions {
  id: string;
  json?: boolean;
}

export function runOrchestrateStatus(opts: OrchestrateStatusOptions): void {
  requireCliOperator({ permission: "chat:read", command: "orchestrate status" });

  if (opts.json) {
    console.log(JSON.stringify(buildOrchestrationStatusPayload(opts.id), null, 2));
    return;
  }

  console.log(formatOrchestrationStatus(opts.id));
}

export interface OrchestrateRetryOptions {
  id: string;
}

export function runOrchestrateRetry(opts: OrchestrateRetryOptions): void {
  requireCliOperator({ permission: "agent:dispatch", command: "orchestrate retry" });
  const retried = retryFailedWorkOrders(opts.id);
  if (!retried.length) {
    console.log("No retryable failed work orders");
    return;
  }
  auditCliMutation("orchestrate retry", opts.id, retried.join(", "));
  console.log(`Queued retry for: ${retried.join(", ")}`);
}

export interface OrchestrateCancelOptions {
  id: string;
}

export function runOrchestrateCancel(opts: OrchestrateCancelOptions): void {
  requireCliOperator({ permission: "agent:dispatch", command: "orchestrate cancel" });
  const cancelled = cancelPendingWorkOrders(opts.id);
  auditCliMutation("orchestrate cancel", opts.id, `${cancelled.length} cancelled`);
  console.log(`Cancelled ${cancelled.length} work order(s)`);
}

export function runOrchestrateStatusSkill(opts: { id?: string; json?: boolean }): void {
  if (!opts.id?.trim()) {
    console.error("orchestration-status requires --id <IMP-...>");
    process.exit(1);
  }
  runOrchestrateStatus({ id: opts.id, json: opts.json });
}
