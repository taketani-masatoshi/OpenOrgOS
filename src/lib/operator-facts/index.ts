export type { FactProvider, FactResult, FactCoverage, FactEscalateHints } from "./types.js";
export {
  listFactProviders,
  findProviderByTool,
  findProviderById,
  matchProviderByIntent,
  matchProviderByTopic,
  formatFactGroundingLines,
} from "./registry.js";
export {
  handleFactChatMessage,
  applyFactRefusalGuard,
  buildFactStructuredPayload,
  requireFactProvider,
  type FactChatResult,
  type FactRefusalGuardResult,
} from "./chat-handler.js";
