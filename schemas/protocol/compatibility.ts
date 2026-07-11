/**
 * Compatibility namespace for callers migrating from physical schema paths.
 * Existing `schemas/protocol/<file>` imports remain canonical aliases.
 */
export * as core from "./core/index.js";
export * as transport from "./transport/index.js";
export * as distribution from "./distribution/index.js";
export * as adapters from "./adapters/index.js";
