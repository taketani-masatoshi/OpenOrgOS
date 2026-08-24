import type { AgentId } from "../../../schemas/classification.js";
import type { OperatorPermission } from "../console-auth/operator-rbac.js";

export type FactCoverage = "registered" | "unregistered" | "partial";

export interface FactResult<V = unknown> {
  ok: boolean;
  coverage: FactCoverage;
  view: V;
  /** When set, chat-handler prefers this over format(view). */
  reply?: string;
  /** Legacy structured keys for Steward Chat (finance_metrics / contract_status). */
  structuredKey?: "finance_metrics" | "contract_status" | "hr_headcount";
}

export interface FactEscalateHints {
  path: string;
  routeBoost: string;
}

export interface FactProvider<V = unknown> {
  id: string;
  toolName: string;
  description: string;
  permission: OperatorPermission;
  /** Deterministic pre-handler trigger (narrow). */
  intent: RegExp;
  /** Broader net for post-LLM refusal guard. */
  topic: RegExp;
  ownerAgent: AgentId;
  escalate: FactEscalateHints;
  /** Short label for grounding block generation. */
  groundingLabel: string;
  /** When true, unregistered coverage auto-files a Work Order. Default true for HR. */
  escalateOnUnregistered?: boolean;
  /**
   * Optional: detect policy-refusal essays in LLM reply (provider-specific).
   * Generic refusal is also checked in chat-handler.
   */
  looksLikeRefusal?: (reply: string) => boolean;
  /**
   * Optional special case: force Work Order instead of KPI view
   * (e.g. contract body / clause detail).
   */
  shouldEscalateDetail?: (message: string) => boolean;
  run(args?: Record<string, unknown>): FactResult<V>;
  format(view: V): string;
}
