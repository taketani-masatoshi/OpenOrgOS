/**
 * Post-LLM guard — stop fake "I delegated / inbox" claims without a real IMP.
 * Path: src/lib/steward-chat/fake-delegation-guard.ts
 */
import { parseHrOnboardIntent, isHrOnboardIntent } from "../hr/onboard.js";
import { handleHrOnboardChatMessage } from "./hr-onboard-intent.js";
import type { OperatorPermission } from "../../../schemas/org/operator.js";

const FAKE_DELEGATION =
  /(?:依頼しました|委譲(?:しました|します)|確認を依頼|結果は(?:インボックス|受信箱|委譲と回答)|インボックスに届|Work\s*Order\s*を起票した(?!（受付)|Human\s*Resources\s*Agent\s*に.{0,40}依頼)/iu;

const HAS_REAL_IMP = /IMP-\d{8}-\d{3}/;

export type FakeDelegationGuardResult = {
  reply: string | undefined;
  guarded: boolean;
  guard_kind?: string;
  plan?: unknown;
  work_order_ids?: string[];
};

export function looksLikeFakeDelegation(reply: string): boolean {
  const n = reply.normalize("NFKC");
  if (!FAKE_DELEGATION.test(n)) return false;
  return !HAS_REAL_IMP.test(n);
}

/**
 * If LLM claimed delegation without IMP, replace with honest path.
 * Hire intent → confirmation card path (async). Other → short redirect.
 */
export async function applyFakeDelegationGuard(
  message: string,
  reply: string | undefined,
  opts?: {
    fromAgent?: string;
    operatorId?: string;
    permissions?: OperatorPermission[];
  }
): Promise<FakeDelegationGuardResult> {
  if (!reply || !looksLikeFakeDelegation(reply)) {
    return { reply, guarded: false };
  }

  if (isHrOnboardIntent(message) || parseHrOnboardIntent(message)) {
    const onboard = await handleHrOnboardChatMessage(message, opts);
    if (onboard.handled && onboard.reply) {
      return {
        reply: onboard.reply,
        guarded: true,
        guard_kind: "fake_delegation_onboard",
        plan: onboard.plan,
        work_order_ids: onboard.work_order_ids,
      };
    }
  }

  return {
    reply: [
      "まだ依頼していません（受付番号はありません）。",
      "部門に確認する場合は「人事に確認して」または「入社手続きを進めて（氏名つき）」と送ってください。",
    ].join("\n"),
    guarded: true,
    guard_kind: "fake_delegation",
  };
}
