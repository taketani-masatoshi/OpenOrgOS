/**
 * Public facade for agent catalog.
 * Pure loaders live in ./agents/catalog.js so activation can import them
 * without a catalog ↔ activation cycle.
 */

export {
  AGENT_CATALOG_PATH,
  getCatalogAgent,
  listCatalogAgents,
  loadAgentCatalog,
  resetAgentCatalogCache,
  resolveAgentId,
  validateAgentCatalog,
} from "./agents/catalog.js";

export { isAgentActive } from "./agent-activation.js";
export type { AgentActivationProfile } from "./agent-activation.js";
