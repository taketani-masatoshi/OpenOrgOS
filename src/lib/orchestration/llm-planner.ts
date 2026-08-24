import type { EscalationInput } from "../../../schemas/routing.js";
import { planWorkOrders, type WorkOrderPlan } from "../escalate.js";

export type OrchestrationPlanSource = "deterministic" | "llm";

export interface OrchestrationPlanProposal {
  source: OrchestrationPlanSource;
  plan: WorkOrderPlan;
  validation: {
    ok: boolean;
    issues: string[];
  };
  /** P1: critique loop output (stub until LLM reviewer wired). */
  critique?: string;
}

/**
 * P1 planner entry — deterministic route match today; LLM decomposition when configured.
 * Always returns a validation envelope so CLI `--propose` can gate on `validation.ok`.
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

  const useLlm =
    process.env.ORGOS_ORCHESTRATE_LLM_PLANNER === "1" &&
    (Boolean(process.env.OPENAI_API_KEY) || Boolean(process.env.ORGOS_LLM_API_URL));

  if (useLlm) {
    // P1 stub: LLM decomposition hook — falls back to deterministic plan until wired.
    return {
      source: "llm",
      plan,
      validation: { ok: issues.length === 0, issues },
      critique: "LLM planner stub — using deterministic route match until critique loop lands.",
    };
  }

  return {
    source: "deterministic",
    plan,
    validation: { ok: issues.length === 0, issues },
  };
}
