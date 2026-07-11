import type { AgentReadinessProfile } from "../../schemas/agent-catalog.js";
import {
  computeAllAgentReadinessProfiles,
} from "./agent-readiness.js";
import {
  computeOpenOrgOsCoreReadiness,
  computeOpenOrgOsCoreStrictReadiness,
} from "./protocol/openorgos-core-readiness.js";
import { computeOrgOsReadiness } from "./protocol/orgos-readiness.js";
import { computeOrgOsStrictReadiness } from "./protocol/orgos-readiness-strict.js";
import { computeCommunityReadiness } from "./protocol/community-readiness.js";
import { evaluateWireImplementationChecklist } from "./protocol/wire-implementation-score.js";
import { resolveTestSuiteVerification } from "./protocol/test-suite-status.js";

export interface ReadinessStatus {
  version: 1;
  evidence: ReturnType<typeof resolveTestSuiteVerification>;
  core: {
    checklist: ReturnType<typeof computeOpenOrgOsCoreReadiness>;
    strict: ReturnType<typeof computeOpenOrgOsCoreStrictReadiness>;
  };
  orgos: {
    checklist: ReturnType<typeof computeOrgOsReadiness>;
    strict: ReturnType<typeof computeOrgOsStrictReadiness>;
  };
  wire: {
    checklist: ReturnType<typeof evaluateWireImplementationChecklist>;
    strict: null;
    strict_detail: string;
  };
  community: ReturnType<typeof computeCommunityReadiness>;
  agents: Record<
    AgentReadinessProfile,
    ReturnType<typeof computeAllAgentReadinessProfiles>[AgentReadinessProfile]
  >;
}

/**
 * Shared readiness facade. It never starts tests: strict Wire remains null until callers supply
 * explicit Vitest evidence to evaluateStrictWireImplementationScore().
 */
export function computeReadinessStatus(): ReadinessStatus {
  return {
    version: 1,
    evidence: resolveTestSuiteVerification(),
    core: {
      checklist: computeOpenOrgOsCoreReadiness(),
      strict: computeOpenOrgOsCoreStrictReadiness(),
    },
    orgos: {
      checklist: computeOrgOsReadiness(),
      strict: computeOrgOsStrictReadiness(),
    },
    wire: {
      checklist: evaluateWireImplementationChecklist(),
      strict: null,
      strict_detail: "not executed; strict readiness requires explicit Vitest execution evidence",
    },
    community: computeCommunityReadiness(),
    agents: computeAllAgentReadinessProfiles(),
  };
}
