/**
 * Deterministic fact chat handler — routes domain KPI questions through FactProviderRegistry.
 * On coverage=unregistered (when escalateOnUnregistered), files a real Work Order.
 */
import { handleStewardOrchestrateChatMessage } from "../steward-chat/steward-orchestrate-intent.js";
import { looksLikeGenericRefusal } from "../steward-chat/contract-status-intent.js";
import {
  findProviderById,
  listFactProviders,
  matchProviderByIntent,
  matchProviderByTopic,
} from "./registry.js";
import type { FactProvider } from "./types.js";

export interface FactChatResult {
  handled: boolean;
  ok?: boolean;
  reply?: string;
  providerId?: string;
  view?: unknown;
  structuredKey?: "finance_metrics" | "contract_status" | "hr_headcount";
  work_order_ids?: string[];
  coverage?: string;
}

export interface FactRefusalGuardResult {
  reply: string | undefined;
  guarded: boolean;
  guard_kind?: string;
  providerId?: string;
  view?: unknown;
  structuredKey?: "finance_metrics" | "contract_status" | "hr_headcount";
  work_order_ids?: string[];
  finance_metrics?: unknown;
  contract_status?: unknown;
  hr_headcount?: unknown;
}

function attachStructured(
  result: FactChatResult | FactRefusalGuardResult,
  key: FactChatResult["structuredKey"],
  view: unknown
): void {
  if (key === "finance_metrics") {
    (result as FactRefusalGuardResult).finance_metrics = view;
  } else if (key === "contract_status") {
    (result as FactRefusalGuardResult).contract_status = view;
  } else if (key === "hr_headcount") {
    (result as FactRefusalGuardResult).hr_headcount = view;
  }
}

function escalateForProvider(
  provider: FactProvider,
  message: string,
  opts?: { fromAgent?: string; routeBoost?: string }
): FactChatResult {
  const orch = handleStewardOrchestrateChatMessage(message, {
    force: true,
    fromAgent: opts?.fromAgent,
    path: provider.escalate.path,
    routeBoost: opts?.routeBoost ?? provider.escalate.routeBoost,
  });
  return {
    handled: true,
    ok: orch.ok === true,
    reply: orch.reply,
    providerId: provider.id,
    work_order_ids: orch.work_order_ids,
    coverage: "unregistered",
  };
}

/**
 * Pre-LLM deterministic answer for registered fact providers.
 */
export function handleFactChatMessage(
  message: string,
  opts?: { fromAgent?: string }
): FactChatResult {
  const provider = matchProviderByIntent(message);
  if (!provider) return { handled: false };

  if (provider.shouldEscalateDetail?.(message)) {
    return escalateForProvider(provider, message, {
      fromAgent: opts?.fromAgent,
      routeBoost: `${provider.escalate.routeBoost}（詳細照会）`,
    });
  }

  const result = provider.run({ message });
  const reply = result.reply ?? provider.format(result.view);

  if (
    result.coverage === "unregistered" &&
    provider.escalateOnUnregistered !== false
  ) {
    const orch = escalateForProvider(
      provider,
      `${provider.ownerAgent} に確認して。${message}`,
      {
        fromAgent: opts?.fromAgent,
        routeBoost: provider.escalate.routeBoost,
      }
    );
    if (orch.work_order_ids && orch.work_order_ids.length > 0) {
      const combined = [
        reply,
        "",
        "---",
        "",
        orch.reply ??
          `${provider.ownerAgent} へ実 Work Order を起票しました（データ未登録）。`,
      ].join("\n");
      return {
        handled: true,
        ok: orch.ok === true,
        reply: combined,
        providerId: provider.id,
        view: result.view,
        structuredKey: result.structuredKey,
        work_order_ids: orch.work_order_ids,
        coverage: "unregistered",
      };
    }
    return {
      handled: true,
      ok: false,
      reply: [
        reply,
        "",
        "---",
        "",
        `**未登録:** \`${provider.escalate.path}\` にデータがありません。`,
        `Human Resources が roster 未有効の場合は \`orgos agent roster enable --agent ${provider.ownerAgent}\` のうえ、`,
        `「${provider.ownerAgent} に確認して」で実 Work Order を起票してください。`,
      ].join("\n"),
      providerId: provider.id,
      view: result.view,
      structuredKey: result.structuredKey,
      coverage: "unregistered",
    };
  }

  const out: FactChatResult = {
    handled: true,
    ok: result.ok,
    reply,
    providerId: provider.id,
    view: result.view,
    structuredKey: result.structuredKey,
    coverage: result.coverage,
  };
  return out;
}

/**
 * Post-LLM refusal recovery — re-run deterministic provider or escalate.
 */
export function applyFactRefusalGuard(
  message: string,
  reply: string | undefined,
  opts?: { fromAgent?: string }
): FactRefusalGuardResult {
  if (!reply) return { reply, guarded: false };

  const n = reply.normalize("NFKC");
  const isRefusal =
    looksLikeGenericRefusal(reply) ||
    listFactProviders().some((p) => p.looksLikeRefusal?.(n));

  if (!isRefusal) return { reply, guarded: false };

  // Detail escalate (contract body etc.) when topic matches
  for (const provider of listFactProviders()) {
    if (!provider.topic.test(message.normalize("NFKC").trim())) continue;
    if (provider.shouldEscalateDetail?.(message)) {
      const orch = escalateForProvider(provider, message, {
        fromAgent: opts?.fromAgent,
        routeBoost: `${provider.escalate.routeBoost}（拒否ガードからの委譲）`,
      });
      return {
        reply: orch.reply,
        guarded: true,
        guard_kind: `${provider.id}_orchestrate`,
        providerId: provider.id,
        work_order_ids: orch.work_order_ids,
      };
    }
  }

  // Prefer intent match, else topic match
  const provider =
    matchProviderByIntent(message) ?? matchProviderByTopic(message);
  if (!provider) return { reply, guarded: false };

  const forcedMessage = provider.intent.test(message.normalize("NFKC").trim())
    ? message
    : `${message}\n${provider.groundingLabel.split("/")[0]?.trim() ?? provider.id}`;

  const recovery = handleFactChatMessage(forcedMessage, {
    fromAgent: opts?.fromAgent,
  });
  if (recovery.handled && recovery.reply) {
    const out: FactRefusalGuardResult = {
      reply: recovery.reply,
      guarded: true,
      guard_kind: provider.id,
      providerId: recovery.providerId,
      view: recovery.view,
      structuredKey: recovery.structuredKey,
      work_order_ids: recovery.work_order_ids,
    };
    attachStructured(out, recovery.structuredKey, recovery.view);
    return out;
  }

  // Last resort: Work Order
  const orch = escalateForProvider(
    provider,
    `${provider.ownerAgent} に確認して。${message}`,
    {
      fromAgent: opts?.fromAgent,
      routeBoost: `${provider.escalate.routeBoost}（拒否ガードからのフォールバック委譲）`,
    }
  );
  return {
    reply: orch.reply,
    guarded: true,
    guard_kind: `${provider.id}_orchestrate`,
    providerId: provider.id,
    work_order_ids: orch.work_order_ids,
  };
}

export function buildFactStructuredPayload(
  result: FactChatResult
): Record<string, unknown> | undefined {
  if (result.work_order_ids?.length) {
    const base: Record<string, unknown> = {
      work_order_ids: result.work_order_ids,
      facts: { id: result.providerId, view: result.view, coverage: result.coverage },
    };
    if (result.structuredKey && result.view !== undefined) {
      base[result.structuredKey] = result.view;
    }
    return base;
  }
  if (!result.providerId) return undefined;
  const base: Record<string, unknown> = {
    facts: { id: result.providerId, view: result.view, coverage: result.coverage },
  };
  if (result.structuredKey && result.view !== undefined) {
    base[result.structuredKey] = result.view;
  }
  return base;
}

/** Test helper — ensure provider exists. */
export function requireFactProvider(id: string): FactProvider {
  const p = findProviderById(id);
  if (!p) throw new Error(`Unknown fact provider: ${id}`);
  return p;
}
