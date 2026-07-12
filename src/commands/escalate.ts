import type { EscalationInput } from "../../schemas/routing.js";
import {
  completeWorkOrder,
  formatPlanOutput,
  listWorkOrders,
  parseEscalationText,
  planWorkOrders,
  regenerateWorkOrderPrompts,
  runEscalation,
} from "../lib/escalate.js";
import { mergeWorkOrderResults, registerWorkOrderResult } from "../lib/work-order-merge.js";
import { formatSecretaryRelayBlock } from "../lib/secretary-relay.js";
import { setTenantId } from "../lib/tenant.js";
import { requireCliOperator } from "../lib/console-auth/cli-operator.js";

export interface EscalatePlanOptions {
  text?: string;
  path?: string;
  subject?: string;
  background?: string;
  requirements?: string;
  deliverables?: string[];
  acceptance?: string[];
  priority?: string;
  tenant?: string;
  dryRun?: boolean;
  json?: boolean;
}

function buildInput(opts: EscalatePlanOptions): EscalationInput {
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

export function runEscalatePlan(opts: EscalatePlanOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  requireCliOperator({ permission: "escalate:plan", command: "escalate plan" });
  if (!opts.text && !opts.requirements && !opts.subject) {
    console.error("Provide --text and/or --subject / --requirements");
    process.exit(1);
  }

  const input = buildInput(opts);
  const plan = planWorkOrders(input);

  if (opts.json) {
    console.log(JSON.stringify({ plan, dryRun: opts.dryRun ?? true }, null, 2));
    return;
  }

  console.log(formatPlanOutput(plan, opts.dryRun ?? true));
  if (plan.agents.length === 0) process.exit(1);
}

export interface EscalateRunCliOptions extends EscalatePlanOptions {
  from?: string;
  id?: string;
}

export function runEscalateRun(opts: EscalateRunCliOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  requireCliOperator({ permission: "escalate:run", command: "escalate run" });

  if (opts.id) {
    const paths = regenerateWorkOrderPrompts(opts.id);
    for (const p of paths) console.log(`✓ ${p}`);
    return;
  }

  if (!opts.text && !opts.requirements && !opts.subject) {
    console.error("Provide --text and/or --subject / --requirements (or --id to regenerate)");
    process.exit(1);
  }

  const input = buildInput(opts);
  const result = runEscalation({
    fromAgent: opts.from ?? "executive_steward",
    input,
    dryRun: false,
    tenant: opts.tenant,
  });

  if (result.workOrders.length === 0) {
    console.error("No eligible agents — run `escalate plan` first");
    process.exit(1);
  }

  for (const f of result.files) {
    console.log(`✓ ${f.yamlPath}`);
    console.log(`✓ ${f.mdPath}`);
    if (f.promptPath) console.log(`✓ ${f.promptPath}`);
  }
  if (result.summaryPath) console.log(`✓ ${result.summaryPath}`);

  console.log(
    `\n${result.workOrders.length} work order(s) · agents: ${result.plan.agents.join(", ")}`
  );
}

export interface EscalateStatusOptions {
  pending?: boolean;
  blocked?: boolean;
  json?: boolean;
}

export function runEscalateStatus(opts: EscalateStatusOptions): void {
  const filter = opts.pending ? "pending" : opts.blocked ? "blocked" : "all";
  const items = listWorkOrders(filter);

  if (opts.json) {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  if (items.length === 0) {
    console.log(`No ${filter === "all" ? "" : filter + " "}work orders.`);
    return;
  }

  console.log("| id | agent | status | subject | priority |");
  console.log("|----|-------|--------|---------|----------|");
  for (const w of items) {
    console.log(
      `| ${w.id} | ${w.to_agent} | ${w.status} | ${(w.subject ?? "—").slice(0, 30)} | ${w.priority ?? "—"} |`
    );
  }
}

export interface EscalateCompleteOptions {
  id: string;
  notes?: string;
}

export function runEscalateComplete(opts: EscalateCompleteOptions): void {
  requireCliOperator({ permission: "escalate:complete", command: "escalate complete" });
  if (opts.notes) {
    registerWorkOrderResult(opts.id, opts.notes, opts.notes);
  } else {
    completeWorkOrder(opts.id);
  }
  console.log(`✓ ${opts.id} → completed`);
  if (opts.notes) console.log(`  notes: ${opts.notes}`);
}

export interface EscalateMergeOptions {
  id: string;
  output?: string;
  autoComplete?: boolean;
}

export function runEscalateMerge(opts: EscalateMergeOptions): void {
  const { path, content } = mergeWorkOrderResults({
    id: opts.id,
    output: opts.output,
    autoCompleteParent: opts.autoComplete,
  });
  console.log(`✓ ${path}`);
  console.log("\n" + content.split("\n").slice(0, 15).join("\n") + "\n…");
  console.log("\n" + formatSecretaryRelayBlock(content, path));
}
