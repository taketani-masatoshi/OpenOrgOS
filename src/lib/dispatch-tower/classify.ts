import type { AgentId } from "../../../schemas/classification.js";
import type { TowerClassification, WorkKind } from "../../../schemas/dispatch-tower.js";
import { parseCashflowChatIntent } from "../jp-bank-corporate/cashflow-request.js";
import { matchProviderByIntent } from "../operator-facts/registry.js";
import { resolveCommandPlan } from "../operator-commands/resolve.js";
import { loadDispatchTowerRegistry } from "./registry-loader.js";

/** Action verbs only. Question words (何 / どう / 教えて) must not steal Steward chat. */
const WORK_REQUEST_HINT =
  /(?:してください|してくれ|してほしい|お願い|までに|作成|調べて|出して|生成して|表示して|起票|承認して)/u;

function normalize(message: string): string {
  return message.normalize("NFKC").trim();
}

function matchRegistryPattern(pattern: string, message: string): boolean {
  try {
    return new RegExp(pattern, "iu").test(message);
  } catch {
    return false;
  }
}

function factGapFromProvider(providerId: string): Pick<TowerClassification, "blocked_on" | "required_tags"> {
  const registry = loadDispatchTowerRegistry();
  const mapped = registry.fact_gap_tags[providerId];
  if (mapped) {
    return {
      blocked_on: mapped.blocked_on,
      required_tags: mapped.tags ?? [],
    };
  }
  return { required_tags: [] };
}

/**
 * Deterministic work-kind classification (ADR 0057).
 */
export function classifyWork(message: string): TowerClassification {
  const n = normalize(message);
  if (!n) {
    return { kind: "unknown", reason: "empty", required_tags: [] };
  }

  const cashflow = parseCashflowChatIntent(message);
  if (cashflow.intent) {
    if (cashflow.ok) {
      return {
        kind: "fact_live",
        reason: "cashflow_intent",
        cashflow_bind: true,
        required_tags: [],
      };
    }
    const registry = loadDispatchTowerRegistry();
    return {
      kind: "fact_gap",
      reason: "cashflow_gap",
      blocked_on: registry.cashflow_gap?.blocked_on ?? "data/finance/cashflow/",
      required_tags: registry.cashflow_gap?.tags ?? ["ssot.fill.cash_balance"],
    };
  }

  const provider = matchProviderByIntent(message);
  if (provider) {
    const result = provider.run({ message });
    const gapMeta = factGapFromProvider(provider.id);
    if (result.coverage === "registered") {
      return {
        kind: "fact_live",
        reason: "fact_provider_registered",
        fact_provider_id: provider.id,
        required_tags: [],
      };
    }
    return {
      kind: "fact_gap",
      reason: "fact_provider_gap",
      fact_provider_id: provider.id,
      blocked_on: gapMeta.blocked_on ?? provider.escalate.path,
      required_tags: gapMeta.required_tags,
    };
  }

  const commandPlan = resolveCommandPlan({ message });
  if (
    commandPlan.skill_id &&
    commandPlan.kind === "read" &&
    (commandPlan.status === "ready" ||
      commandPlan.status === "needs_confirmation" ||
      commandPlan.status === "needs_args")
  ) {
    return {
      kind: "fact_live",
      reason: "command_read",
      command_skill_id: commandPlan.skill_id,
      required_tags: [],
    };
  }

  const registry = loadDispatchTowerRegistry();
  for (const row of registry.judgment_patterns) {
    if (matchRegistryPattern(row.pattern, n)) {
      return { kind: "judgment", reason: "judgment_keyword", required_tags: [] };
    }
  }

  for (const row of registry.human_act_patterns) {
    if (matchRegistryPattern(row.pattern, n)) {
      return {
        kind: "human_act",
        reason: "human_act_keyword",
        required_tags: row.required_tags ?? [],
      };
    }
  }

  for (const row of registry.aia_draft_patterns) {
    if (matchRegistryPattern(row.pattern, n)) {
      return {
        kind: "aia_draft",
        reason: "aia_draft_keyword",
        owner_agent: row.owner_agent ?? ("secretary" as AgentId),
        required_tags: [],
      };
    }
  }

  if (!WORK_REQUEST_HINT.test(n)) {
    return { kind: "unknown", reason: "not_work_request", required_tags: [] };
  }

  return { kind: "unknown", reason: "no_match", required_tags: [] };
}

export function isTowerWorkRequest(message: string): boolean {
  const kind = classifyWork(message).kind;
  return kind !== "unknown" || WORK_REQUEST_HINT.test(normalize(message));
}
