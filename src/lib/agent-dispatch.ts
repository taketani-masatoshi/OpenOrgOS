/**
 * Public facade for agent dispatch.
 * Implementation lives under src/lib/agents/dispatch/.
 */

export type { DispatchRuntime } from "./agents/dispatch/manifest.js";
export {
  isCursorSdkAvailable,
  resolveWorkOrdersForDispatch,
  buildDispatchManifest,
  writeDispatchManifest,
} from "./agents/dispatch/manifest.js";

export type { DispatchRunResult, DispatchRunOptions } from "./agents/dispatch/wave-run.js";
export { runDispatch } from "./agents/dispatch/wave-run.js";

export { formatDispatchPlan } from "./agents/dispatch/plan-format.js";

export { loadCursorSdk } from "./agents/dispatch/cursor-sdk.js";
