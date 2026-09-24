import type { EscalationInput, WorkOrderPlan } from "../../../schemas/routing.js";
import { planWorkOrders } from "../escalate.js";

export interface OrchestrationPlanProposal {
  /** Always "deterministic" today — LLM decomposition lands with the P1 critique loop. */
  source: "deterministic";
  plan: WorkOrderPlan;
  validation: {
    ok: boolean;
    issues: string[];
  };
}

/**
 * Proposes a work order plan and reports why it would be rejected, so `orchestrate plan
 * --propose` can gate on `validation.ok` before anything is written to the routing queue.
 */
export function proposeOrchestrationPlan(input: EscalationInput): OrchestrationPlanProposal {
  const plan = planWorkOrders(input);
  const issues: string[] = [];

  if (plan.agents.length === 0) {
    issues.push("no eligible agents matched routing registry");
  }
  for (const match of plan.matches.filter((m) => !m.eligible)) {
    issues.push(`route ${match.routeId} (${match.agent}) not eligible`);
  }

  return {
    source: "deterministic",
    plan,
    validation: { ok: issues.length === 0, issues },
  };
}
