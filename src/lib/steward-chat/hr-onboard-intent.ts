/**
 * Chat intent for hire / onboarding — confirmation card, no silent YAML write.
 * Path: src/lib/steward-chat/hr-onboard-intent.ts
 */
import type { OperatorPermission } from "../../../schemas/org/operator.js";
import type { CommandPlan } from "../../../schemas/operator-commands.js";
import type { CommandRunResult } from "../../../schemas/operator-commands.js";
import {
  buildHrOnboardPlan,
  formatHrOnboardPlanMarkdown,
  isHrOnboardIntent,
  parseHrOnboardIntent,
} from "../hr/onboard.js";
import { handleChatCommandMessage } from "../operator-commands/execute.js";
import { isSecretaryMandate } from "../agent-owner-desks.js";

export { isHrOnboardIntent, parseHrOnboardIntent };

export type HrOnboardChatResult = {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  plan?: CommandPlan;
  run?: CommandRunResult;
  work_order_ids?: string[];
};

/**
 * Match hire phrasing → write confirmation card for skill hr_onboard.
 */
export async function handleHrOnboardChatMessage(
  message: string,
  opts?: {
    fromAgent?: string;
    operatorId?: string;
    permissions?: OperatorPermission[];
  }
): Promise<HrOnboardChatResult> {
  const parsed = parseHrOnboardIntent(message);
  if (!parsed) {
    if (isHrOnboardIntent(message)) {
      return {
        handled: true,
        ok: false,
        reply:
          "入社手続きには氏名が必要です。「名前は〇〇です。入社手続きを進めて」と送ってください。",
      };
    }
    return { handled: false };
  }

  if (isSecretaryMandate(opts?.fromAgent)) {
    return {
      handled: true,
      ok: false,
      reply:
        "入社名簿の更新はスチュワードへの直接依頼が必要です。秘書窓口からは状況の照会のみ可能です。",
    };
  }

  const preview = buildHrOnboardPlan(parsed);
  const commandResult = await handleChatCommandMessage({
    message,
    skillId: "hr_onboard",
    args: {
      name: parsed.name,
      hired_date: parsed.hired_date ?? null,
      write: true,
    },
    operatorId: opts?.operatorId,
    permissions: opts?.permissions,
    fromAgent: opts?.fromAgent ?? "executive_steward",
  });

  if (!commandResult.handled) {
    return {
      handled: true,
      ok: false,
      reply: "入社手続きコマンドを準備できませんでした。`orgos hr onboard` を確認してください。",
    };
  }

  const reply = [
    formatHrOnboardPlanMarkdown(preview),
    "",
    commandResult.reply ?? "**入社手続き** — 実行確認",
  ].join("\n");

  return {
    handled: true,
    ok: true,
    reply,
    plan: commandResult.plan,
    run: commandResult.run,
  };
}
