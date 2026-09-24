/**
 * Public facade for agent readiness scoring.
 * Implementation lives under src/lib/agents/readiness/.
 */

export {
  computeAgentReadiness,
  computeAllAgentReadiness,
  computeAgentReadinessProfile,
  computeAllAgentReadinessProfiles,
  agentDefinitionExists,
} from "./agents/readiness/profiles.js";

export { formatAgentReadinessReport } from "./agents/readiness/report.js";
