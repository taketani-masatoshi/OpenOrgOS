/**
 * Compatibility namespace for gradual migration from physical module imports.
 * No implementation is moved; old `src/lib/protocol/<file>` imports stay valid.
 */
export * as core from "./core/index.js";
export * as transport from "./transport/index.js";
export * as distribution from "./distribution/index.js";
export * as adapters from "./adapters/index.js";
