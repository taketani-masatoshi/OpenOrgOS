/**
 * Domain-oriented protocol command facade.
 *
 * Use focused modules for new registrations. `../protocol.ts` remains the
 * compatibility export during the staged, non-breaking handler split.
 */
export * as identity from "./identity.js";
export * as peer from "./peer.js";
export * as delivery from "./delivery.js";
export * as witness from "./witness.js";
export * as trust from "./trust.js";
export * as community from "./community.js";
export * as relay from "./relay.js";
