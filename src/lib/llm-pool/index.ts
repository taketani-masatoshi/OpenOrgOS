export {
  LLM_WORKERS_REL,
  defaultLlmWorkersConfig,
  envFallbackWorker,
  loadLlmWorkersConfig,
  loadLlmWorkersConfigFile,
  saveLlmWorkersConfig,
  initLlmWorkersConfig,
  resolveWorkerApiKey,
  isWorkerKeyConfigured,
  workerToLlmApiConfig,
  hasConfiguredLlmWorkers,
  validateLlmWorkersIntegrity,
  llmWorkersPath,
} from "./registry.js";
export type { LlmWorkersConfig, LlmWorker, LlmWorkersIntegrityIssue } from "./registry.js";

export {
  withLlmWorker,
  LlmPoolError,
  setLlmPoolConfigOverride,
  getLlmPoolQueueSnapshot,
  resetLlmPoolRouterForTests,
} from "./router.js";
export type { LlmWorkerLease, LlmRouteHint } from "./router.js";

export {
  snapshotWorkerStats,
  getTotalInflight,
  getQueueDepth,
  resetLlmPoolStatsForTests,
  clearWorkerUnhealthy,
  markWorkerUnhealthy,
} from "./stats.js";
export type { WorkerRuntimeStats } from "./stats.js";

export { probeWorker } from "./health.js";
export type { WorkerProbeResult } from "./health.js";
