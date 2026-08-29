import { classifyWork } from "../lib/dispatch-tower/classify.js";
import {
  buildTowerInventory,
  formatTowerInventoryMarkdown,
} from "../lib/dispatch-tower/inventory.js";
import {
  executeTowerAssign,
  loadTowerPlan,
  saveTowerPlan,
} from "../lib/dispatch-tower/assign.js";

export function runTowerClassify(opts: { text: string; json?: boolean }): void {
  const classification = classifyWork(opts.text);
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, classification }, null, 2));
    return;
  }
  console.log(`kind: ${classification.kind}`);
  console.log(`reason: ${classification.reason}`);
  if (classification.fact_provider_id) {
    console.log(`fact_provider_id: ${classification.fact_provider_id}`);
  }
  if (classification.command_skill_id) {
    console.log(`command_skill_id: ${classification.command_skill_id}`);
  }
  if (classification.blocked_on) console.log(`blocked_on: ${classification.blocked_on}`);
  if (classification.required_tags?.length) {
    console.log(`required_tags: ${classification.required_tags.join(", ")}`);
  }
}

export function runTowerInventory(opts: { json?: boolean }): void {
  const inventory = buildTowerInventory();
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, inventory }, null, 2));
    return;
  }
  console.log(formatTowerInventoryMarkdown(inventory));
}

export function runTowerAssign(opts: {
  planId: string;
  confirmed?: boolean;
  assigneeEmployeeId?: string;
  dueDate?: string;
  json?: boolean;
}): void {
  if (!opts.confirmed) {
    console.error("tower assign requires --confirmed");
    process.exit(1);
  }
  const plan = loadTowerPlan(opts.planId);
  if (!plan) {
    console.error(`tower plan not found: ${opts.planId}`);
    process.exit(1);
  }
  const result = executeTowerAssign(plan, {
    assignee_employee_id: opts.assigneeEmployeeId,
    due_date: opts.dueDate,
  });
  if (!result.ok) {
    console.error(result.error ?? "assign failed");
    process.exit(1);
  }
  if (result.plan) saveTowerPlan(result.plan);
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          work_order_ids: result.work_order_ids,
          plan: result.plan,
        },
        null,
        2
      )
    );
    return;
  }
  for (const id of result.work_order_ids ?? []) {
    console.log(`✓ Work Order ${id}`);
  }
}
