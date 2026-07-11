/**
 * Delivery-domain command facade.
 *
 * Existing imports from commands/protocol remain valid while the registrar
 * and new code depend on this focused surface.
 */
export {
  runProtocolDeliver,
  runProtocolDeliverStatus,
  runProtocolDeliverFlushPending,
  runProtocolDeliverPull,
  runProtocolMeshDeliver,
  runProtocolRelayOnce,
  runProtocolRelayRun,
  runProtocolRelayStatus,
  runProtocolSlaCheck,
  runProtocolMailWireScan,
} from "../protocol.js";

export type {
  ProtocolDeliverOptions,
  ProtocolDeliverStatusOptions,
  ProtocolDeliverFlushPendingOptions,
  ProtocolDeliverPullOptions,
  ProtocolMeshDeliverOptions,
  ProtocolRelayOnceOptions,
  ProtocolRelayRunOptions,
  ProtocolRelayStatusOptions,
  ProtocolSlaCheckOptions,
  ProtocolMailWireScanOptions,
} from "../protocol.js";
