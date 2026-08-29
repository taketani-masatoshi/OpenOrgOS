/**
 * Owner desks: Steward and Secretary are always-on windows to the owner.
 * Other agents are reached through Steward. Secretary never dispatches
 * to field agents. Company YAML mutation is owner→Steward only.
 */
import type { AgentId } from "../../schemas/classification.js";

export const OWNER_DESK_STEWARD = "executive_steward" as const;
export const OWNER_DESK_SECRETARY = "secretary" as const;
export const OWNER_DESK_AGENT_IDS = [OWNER_DESK_STEWARD, OWNER_DESK_SECRETARY] as const;

export type OwnerDeskAgentId = (typeof OWNER_DESK_AGENT_IDS)[number];
export type AgentLockReason = "owner_desk" | "required" | "module_enabled";
export type AgentRequestLane = "owner_to_steward" | "owner_to_secretary" | "via_steward";

export function isOwnerDeskAgent(id: string): id is OwnerDeskAgentId {
  return id === OWNER_DESK_STEWARD || id === OWNER_DESK_SECRETARY;
}

export function isSecretaryMandate(fromAgent: string | undefined): boolean {
  return (fromAgent ?? "").trim() === OWNER_DESK_SECRETARY;
}

/** Secretary may only ask Steward — never Finance / Contract / other field agents. */
export function secretaryMayDispatchTo(target: string): boolean {
  return target === OWNER_DESK_STEWARD;
}

/** Steward may rewrite company data only on an owner-direct request. */
export function stewardMayMutateCompanyData(fromAgent: string | undefined): boolean {
  return !isSecretaryMandate(fromAgent);
}

export function requestLaneForAgent(id: string): AgentRequestLane {
  if (id === OWNER_DESK_STEWARD) return "owner_to_steward";
  if (id === OWNER_DESK_SECRETARY) return "owner_to_secretary";
  return "via_steward";
}

export const SECRETARY_CONSULT_NOTE =
  "Secretary consult. Do not dispatch to other agents from this mandate. Share company status (L0–L1) only. Do not rewrite company YAML — that requires an owner-direct Steward request.";

export function formatSecretaryConsultCeoReply(rootId: string): string {
  return [
    `社内担当への照会はスチュワード経由で受け付けました（受付 ${rootId}）。`,
    "秘書から他のエージェントへ直接は依頼しません。",
    "会社データの書き換えは、オーナーからスチュワードへの直接依頼でのみ行います。",
  ].join("\n");
}

export function formatOwnerDeskChatRules(agentId: AgentId | string | undefined): string {
  if (agentId === OWNER_DESK_SECRETARY) {
    return [
      "",
      "## Owner desk — secretary",
      "- You are the owner's secretary window (schedule, external drafts, 1-on-1).",
      "- You must not dispatch to Finance / Contract / Compliance / Operations / other field agents.",
      "- If another internal agent is needed, consult Executive Steward only.",
      "- Steward may brief you on company status within L0–L1. Steward must not rewrite company YAML on your mandate.",
      "",
    ].join("\n");
  }
  if (agentId === OWNER_DESK_STEWARD) {
    return [
      "",
      "## Owner desk — steward",
      "- You orchestrate every internal agent for owner-direct questions.",
      "- Secretary-originated consults are read/brief only: do not mutate company YAML or apply tenant config.",
      "- Company data writes happen only on owner-direct requests in this Steward thread.",
      "",
    ].join("\n");
  }
  return "";
}
