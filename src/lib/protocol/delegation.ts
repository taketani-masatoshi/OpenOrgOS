import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import YAML from "yaml";
import type { DelegationProof } from "../../../schemas/protocol/authority-delegation.js";
import { delegationProofSchema } from "../../../schemas/protocol/authority-delegation.js";
import type { EventEnvelope, OrgRef } from "../../../schemas/protocol/org-event.js";
import { actorIdentitySchema } from "../../../schemas/protocol/identity-exchange.js";
import { STEWARD_AGENTS_DIR } from "../steward-paths.js";
import { scopesForAgent } from "../org/delegation-scopes.js";
import { ourOrgRef } from "./identity.js";
import { maybeSignEnvelope } from "./signing.js";

interface AgentRegistryEntry {
  id: string;
  scope?: string;
}

function loadAgentRegistry(): AgentRegistryEntry[] {
  const raw = readFileSync(`${STEWARD_AGENTS_DIR}/registry.yaml`, "utf-8");
  const doc = YAML.parse(raw) as { agents?: Record<string, AgentRegistryEntry> };
  return Object.values(doc.agents ?? {});
}

export { scopesForAgent } from "../org/delegation-scopes.js";

export function exportDelegationProof(options: {
  scope: string;
  granteeAgent: string;
  granteeOrg?: OrgRef;
  /** Legal/policy basis for the delegation (jurisdiction policy_ref). Caller must supply explicitly. */
  basisRef?: string;
}): DelegationProof {
  const granteeScopes = scopesForAgent(options.granteeAgent);
  if (!granteeScopes.includes(options.scope)) {
    throw new Error(
      `Scope ${options.scope} not mapped to agent ${options.granteeAgent} (available: ${granteeScopes.join(", ")})`
    );
  }

  const agents = loadAgentRegistry();
  const agent = agents.find((a) => a.id === options.granteeAgent);
  if (!agent) {
    throw new Error(`Unknown agent: ${options.granteeAgent}`);
  }

  const now = new Date().toISOString();
  const grantee =
    options.granteeOrg ??
    actorIdentitySchema.parse({
      actor_id: options.granteeAgent,
      role: agent.id,
      org_ref: ourOrgRef(),
    });

  return delegationProofSchema.parse({
    grant: {
      grant_id: `GRANT-${options.granteeAgent}-${options.scope.replace(/\./g, "-")}`,
      grantor: ourOrgRef(),
      grantee,
      scope: [options.scope],
      valid_from: now,
    },
    ...(options.basisRef ? { basis_ref: options.basisRef } : {}),
    issued_at: now,
  });
}

export function buildDelegationEnvelope(
  proof: DelegationProof,
  destination?: OrgRef
): EventEnvelope {
  const now = new Date().toISOString();
  const envelope: EventEnvelope = {
    protocol_version: "1",
    event_id: randomUUID(),
    occurred_at: now,
    origin: proof.grant.grantor,
    destination,
    identity: { org_ref: proof.grant.grantor },
    delegation: { grant_id: proof.grant.grant_id },
    event: {
      type: "org.authority.delegated",
      payload: { proof },
    },
    signature: null,
  };
  return maybeSignEnvelope(envelope);
}
