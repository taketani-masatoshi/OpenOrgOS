import type { OperatorPermission } from "../../../schemas/org/operator.js";
import type { OperatorToolContext } from "../operator-runtime/tools.js";
import { handleCashflowChatMessage } from "../jp-bank-corporate/cashflow-chat-intent.js";
import { handleFactChatMessage } from "../operator-facts/chat-handler.js";
import { handleChatCommandMessage } from "../operator-commands/execute.js";
import type { TowerPlan } from "../../../schemas/dispatch-tower.js";
import { classifyWork } from "./classify.js";
import {
  buildTowerPlan,
  formatTowerPlanPreview,
  saveTowerPlan,
} from "./assign.js";

export interface TowerChatContext {
  fromAgent?: string;
  operatorId?: string;
  approverId?: string;
  permissions?: OperatorPermission[];
  toolCtx: OperatorToolContext;
}

export interface TowerChatResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  tower_plan?: TowerPlan;
  classification?: ReturnType<typeof classifyWork>;
  structured?: Record<string, unknown>;
}

async function executeFactLive(
  message: string,
  ctx: TowerChatContext
): Promise<TowerChatResult> {
  const classification = classifyWork(message);
  if (classification.cashflow_bind) {
    if (ctx.fromAgent === "secretary") {
      return {
        handled: true,
        ok: false,
        reply:
          "資金繰り表の更新はオーナーからスチュワードへの直接依頼でのみ行います。秘書窓口からは状況の照会のみ可能です。",
        classification,
      };
    }
    const cashflow = await handleCashflowChatMessage(message, ctx.toolCtx);
    if (cashflow.handled) {
      return {
        handled: true,
        ok: cashflow.ok,
        reply: cashflow.reply,
        classification,
        structured: cashflow.structured as Record<string, unknown> | undefined,
      };
    }
  }

  if (classification.fact_provider_id) {
    const fact = handleFactChatMessage(message, {
      fromAgent: ctx.fromAgent,
      suppressEscalate: true,
    });
    if (fact.handled && fact.reply) {
      return {
        handled: true,
        ok: fact.ok !== false,
        reply: fact.reply,
        classification,
        structured: {
          providerId: fact.providerId,
          coverage: fact.coverage,
        },
      };
    }
  }

  if (classification.command_skill_id) {
    const command = await handleChatCommandMessage({
      message,
      operatorId: ctx.operatorId,
      permissions: ctx.permissions,
      fromAgent: ctx.fromAgent,
    });
    if (command.handled && command.reply) {
      return {
        handled: true,
        ok: command.run?.ok !== false,
        reply: command.reply,
        classification,
        structured: {
          command_plan: command.plan,
          command_run: command.run,
        },
      };
    }
  }

  return { handled: false, classification };
}

/**
 * Dispatch Tower pre-handler — classify before orchestrate / fact auto-escalate.
 */
export async function handleTowerChatMessage(
  message: string,
  ctx: TowerChatContext
): Promise<TowerChatResult> {
  let classification: ReturnType<typeof classifyWork>;
  try {
    classification = classifyWork(message);
  } catch {
    // Stale install image / missing registry must not block Steward chat.
    return { handled: false };
  }

  if (classification.kind === "unknown") {
    // Unclassified chat (including 「〜してください」) must reach
    // Steward orchestration + LLM. There is no execute card on this surface.
    return { handled: false };
  }

  if (classification.kind === "fact_live") {
    const live = await executeFactLive(message, ctx);
    if (live.handled) {
      return live;
    }
    classification = {
      kind: "fact_gap",
      reason: "fact_live_unavailable",
      fact_provider_id: classification.fact_provider_id,
      command_skill_id: classification.command_skill_id,
      cashflow_bind: classification.cashflow_bind,
      blocked_on: classification.blocked_on,
      required_tags: classification.required_tags ?? [],
    };
  }

  const plan = buildTowerPlan(message, classification);
  saveTowerPlan(plan);

  return {
    handled: true,
    ok: true,
    reply: plan.reply_preview ?? formatTowerPlanPreview(message, classification, plan.assignment),
    tower_plan: plan,
    classification,
    structured: { tower_plan: plan },
  };
}
