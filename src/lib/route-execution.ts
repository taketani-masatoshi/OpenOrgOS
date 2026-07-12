import type { Handoff, HandoffInvocation } from "../../schemas/routing.js";
import type { SkillRunOptions } from "../commands/skills.js";
import type { SkillInvocationResolution } from "./skill-invocation.js";
import { resolveAgentId } from "./agent-catalog.js";
import { appendAuditEvent } from "./audit-log.js";
import { resolveSkillExecutionPlan } from "./skill-execution-mode.js";
import type { AgentId } from "../../schemas/classification.js";

export type InvocationResolver = (
  skillId: string,
  opts?: SkillRunOptions
) => SkillInvocationResolution;

export type RouteExecutionAction =
  | "suggest"
  | "noop"
  | "direct_skill"
  | "deferred"
  | "work_order"
  | "human_approval"
  | "blocked"
  | "failed";

export interface RouteExecutionOutcome {
  action: RouteExecutionAction;
  handoff: Handoff;
  message: string;
}

function isHumanApprovalOperation(handoff: Handoff): boolean {
  const skill = handoff.skill?.toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  if (
    /(?:^|_)(?:wire_(?:send|transmit)|send_wire|protocol_notice_approve|approval|approve|broker_transfer)(?:_|$)/.test(
      skill
    )
  ) {
    return true;
  }

  const text = [handoff.context.text, handoff.notes].filter(Boolean).join(" ").toLowerCase();
  return (
    /\b(?:wire|protocol notice|approval|broker transfer)\b.{0,40}\b(?:send|transmit|approve|execute)\b/.test(
      text
    ) ||
    /(?:wire送信|wireを送信|承認操作|承認を実行|振込実行)/i.test(text)
  );
}

function invocationFromResolution(
  handoff: Handoff,
  decision: HandoffInvocation["decision"],
  status: HandoffInvocation["status"],
  resolution?: SkillInvocationResolution
): HandoffInvocation {
  const previous = handoff.invocation;
  const required =
    resolution && "skill" in resolution ? resolution.skill?.required_options ?? [] : [];
  const missing =
    resolution?.status === "deferred" ? resolution.missingOptions ?? [] : [];
  return {
    decision,
    status,
    skill_id: resolution && "skill" in resolution ? resolution.skill?.id : handoff.skill,
    execution: resolution?.execution,
    argv: resolution && "argv" in resolution ? resolution.argv : undefined,
    arguments: previous?.arguments ?? {},
    required_arguments: required,
    missing_arguments: missing,
    attempts: previous?.attempts ?? 0,
    result: previous?.result,
    failure_reason:
      resolution && resolution.status !== "ready" ? resolution.reason : undefined,
    started_at: previous?.started_at,
    finished_at: previous?.finished_at,
  };
}

function withInvocation(handoff: Handoff, invocation: HandoffInvocation): Handoff {
  return { ...handoff, invocation };
}

export function evaluateRouteExecution(
  handoff: Handoff,
  mode: "suggest" | "auto" | "implement",
  resolveInvocation: InvocationResolver
): RouteExecutionOutcome & { resolution?: SkillInvocationResolution } {
  if (mode === "suggest") {
    return { action: "suggest", handoff, message: "suggest mode does not execute" };
  }
  if (
    handoff.status === "dispatched" ||
    handoff.status === "completed" ||
    handoff.invocation?.status === "succeeded"
  ) {
    return { action: "noop", handoff, message: "handoff already dispatched or completed" };
  }
  if (isHumanApprovalOperation(handoff)) {
    return {
      action: "human_approval",
      handoff: withInvocation(
        handoff,
        invocationFromResolution(handoff, "human_approval", "human_approval")
      ),
      message: "wire transmission and approval operations require an explicit human gate",
    };
  }
  if (!handoff.access.allowed) {
    return { action: "blocked", handoff, message: handoff.access.reason };
  }
  if (
    mode === "implement" ||
    handoff.task_type === "implement" ||
    Boolean(handoff.parent_id) ||
    Boolean(handoff.child_ids?.length)
  ) {
    return {
      action: "work_order",
      handoff: withInvocation(
        handoff,
        invocationFromResolution(handoff, "work_order", "work_order")
      ),
      message: "implementation and multi-agent work execute through a Work Order",
    };
  }
  if (!handoff.skill) {
    return {
      action: "work_order",
      handoff: withInvocation(
        handoff,
        invocationFromResolution(handoff, "work_order", "work_order")
      ),
      message: "handoff has no deterministic skill; use a Work Order",
    };
  }

  const skillOpts = (handoff.invocation?.arguments ?? {}) as SkillRunOptions;
  const toAgent = (resolveAgentId(handoff.to_agent) ?? handoff.to_agent) as AgentId;
  const plan = resolveSkillExecutionPlan(
    handoff.skill,
    { fromAgent: handoff.from_agent, toAgent },
    resolveInvocation,
    skillOpts
  );
  const resolution = plan.resolution;

  if (plan.mode === "human_approval") {
    return {
      action: "human_approval",
      handoff: withInvocation(
        handoff,
        invocationFromResolution(handoff, "human_approval", "human_approval", resolution)
      ),
      resolution,
      message: plan.reason,
    };
  }

  if (
    plan.mode === "delegate_work_order" ||
    plan.mode === "escalate" ||
    plan.mode === "agent_interactive"
  ) {
    return {
      action: "work_order",
      handoff: withInvocation(
        handoff,
        invocationFromResolution(handoff, "work_order", "work_order", resolution)
      ),
      resolution,
      message: plan.reason,
    };
  }

  if (plan.mode === "deferred" || !resolution || resolution.status !== "ready") {
    return {
      action: "deferred",
      handoff: withInvocation(
        handoff,
        invocationFromResolution(handoff, "direct_skill", "deferred", resolution)
      ),
      resolution,
      message: plan.reason,
    };
  }

  return {
    action: "direct_skill",
    handoff: withInvocation(
      handoff,
      invocationFromResolution(handoff, "direct_skill", "planned", resolution)
    ),
    resolution,
    message: plan.reason,
  };
}

export async function executeRouteHandoff(
  handoff: Handoff,
  mode: "suggest" | "auto" | "implement",
  resolveInvocation: InvocationResolver
): Promise<RouteExecutionOutcome> {
  const evaluated = evaluateRouteExecution(handoff, mode, resolveInvocation);
  if (evaluated.action !== "direct_skill" || evaluated.resolution?.status !== "ready") {
    if (!["suggest", "noop"].includes(evaluated.action)) {
      appendAuditEvent({
        event: "route_dispatch",
        ref: handoff.id,
        actor: handoff.from_agent,
        detail: `decision:${evaluated.action}: ${evaluated.message}`,
      });
    }
    return evaluated;
  }

  const resolution = evaluated.resolution;
  const startedAt = new Date().toISOString();
  const attempts = (evaluated.handoff.invocation?.attempts ?? 0) + 1;
  appendAuditEvent({
    event: "route_dispatch",
    ref: handoff.id,
    actor: handoff.from_agent,
    detail: `invocation_started:${attempts}:${resolution.skill.id}`,
  });

  try {
    await resolution.handler(
      (evaluated.handoff.invocation?.arguments ?? {}) as SkillRunOptions
    );
    const finishedAt = new Date().toISOString();
    const updated: Handoff = {
      ...evaluated.handoff,
      mode: "auto",
      status: "dispatched",
      invocation: {
        ...evaluated.handoff.invocation!,
        status: "succeeded",
        attempts,
        result: "completed",
        failure_reason: undefined,
        started_at: startedAt,
        finished_at: finishedAt,
      },
    };
    appendAuditEvent({
      event: "route_dispatch",
      ref: handoff.id,
      actor: handoff.from_agent,
      detail: `invocation_succeeded:${attempts}:${resolution.skill.id}`,
    });
    return { action: "direct_skill", handoff: updated, message: "skill invocation succeeded" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const updated: Handoff = {
      ...evaluated.handoff,
      invocation: {
        ...evaluated.handoff.invocation!,
        status: "failed",
        attempts,
        failure_reason: reason,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      },
    };
    appendAuditEvent({
      event: "route_dispatch",
      ref: handoff.id,
      actor: handoff.from_agent,
      detail: `invocation_failed:${attempts}:${resolution.skill.id}: ${reason}`,
    });
    return { action: "failed", handoff: updated, message: reason };
  }
}
