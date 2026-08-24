/**
 * Capability model — default deny (isolation plan M2).
 * Evaluation is deterministic; never delegate to an LLM.
 */

import type { ModuleSecuritySection } from "../../schemas/module-security-manifest.js";

export type CapabilityDecision = "allow" | "deny" | "require_approval";

/** Canonical capability strings used by Gateway / Relay. */
export const CAP = {
  storageOwnRead: "storage.own.read",
  storageOwnReadWrite: "storage.own.read_write",
  dataRead: (resource: string) => `data.read.${resource}`,
  dataPropose: (action: string) => `data.propose.${action}`,
  dataExecute: (action: string) => `data.execute.${action}`,
  agentRelay: (target: string) => `agent.relay.${target}`,
  networkEgress: (host: string) => `network.egress.${host}`,
  secretsUse: (id: string) => `secrets.use.${id}`,
  aiObserve: "ai.observe",
  aiAnalyze: "ai.analyze",
  aiDraft: "ai.draft",
  aiPropose: "ai.propose",
  aiApprove: "ai.approve",
  aiExecute: "ai.execute",
} as const;

/** Gateway API id → required capability. */
export const GATEWAY_API_CAPABILITY: Record<string, string> = {
  "vendor.read_basic": CAP.dataRead("vendor.basic"),
  "payment.propose": CAP.dataPropose("payment"),
};

export function grantedCapabilitiesFromSecurity(
  security: ModuleSecuritySection
): Set<string> {
  const granted = new Set<string>();
  const p = security.permissions;

  if (p.storage_own === "read") granted.add(CAP.storageOwnRead);
  if (p.storage_own === "read_write") {
    granted.add(CAP.storageOwnRead);
    granted.add(CAP.storageOwnReadWrite);
  }
  for (const r of p.data_read) granted.add(CAP.dataRead(r));
  for (const a of p.data_propose) granted.add(CAP.dataPropose(a));
  for (const a of p.data_execute) granted.add(CAP.dataExecute(a));
  for (const t of p.agent_relay) granted.add(CAP.agentRelay(t));
  for (const h of p.network_egress) granted.add(CAP.networkEgress(h));
  for (const s of p.secrets_use) granted.add(CAP.secretsUse(s));

  const ai = security.ai;
  if (ai.can_observe) granted.add(CAP.aiObserve);
  if (ai.can_analyze) granted.add(CAP.aiAnalyze);
  if (ai.can_draft) granted.add(CAP.aiDraft);
  if (ai.can_propose) granted.add(CAP.aiPropose);
  if (ai.can_approve) granted.add(CAP.aiApprove);
  if (ai.can_execute) granted.add(CAP.aiExecute);

  return granted;
}

export interface EvaluateCapabilityInput {
  granted: ReadonlySet<string>;
  required: string;
  /** When true (third_party), execute/approve capabilities are always denied. */
  trustClass?: "internal" | "third_party";
}

/**
 * Default deny. Missing grant → deny.
 * Third-party: data.execute.* and ai.approve / ai.execute → deny even if listed.
 */
export function evaluateCapability(input: EvaluateCapabilityInput): CapabilityDecision {
  const { granted, required, trustClass = "internal" } = input;

  if (trustClass === "third_party") {
    if (
      required.startsWith("data.execute.") ||
      required === CAP.aiApprove ||
      required === CAP.aiExecute
    ) {
      return "deny";
    }
  }

  if (!granted.has(required)) return "deny";

  if (required.startsWith("data.execute.") || required === CAP.aiExecute) {
    return "require_approval";
  }

  return "allow";
}

export function requireCapability(
  input: EvaluateCapabilityInput
): asserts input is EvaluateCapabilityInput & { granted: ReadonlySet<string> } {
  const d = evaluateCapability(input);
  if (d === "deny") {
    throw new Error(`capability denied: ${input.required}`);
  }
}
