export * from "./org-event.js";
export * from "./identity-exchange.js";
export * from "./authority-delegation.js";
export * from "./transaction-record.js";
export * from "./audit-record.js";
export * from "./peers.js";
export * from "./registry.js";
export * from "./operator-attestation.js";
export * from "./pending-notice.js";
export * from "./witness-attestation.js";
export * from "./witness-receipt.js";
export * from "./witness-pool.js";
export * from "./witness-quorum.js";
export * from "./witness-pending.js";
export * from "./wire-pending.js";
export * from "./wire-delivered.js";
export * from "./trusted-hubs.js";
export * from "./hub-federation.js";
export type {
  WireApprovalTier,
  WireApprovalGateInput,
  WireApprovalGateResult,
  OrgApprovalTier,
} from "./wire-approval.js";
export * from "./peer-endpoint.js";
export * from "./resilience-sla.js";
export * from "./witness-trust.js";
export * from "./relay-state.js";
export * from "./wire-relay.js";
export * from "./contract-protocol.js";
export * from "./protocol-api-config.js";
export * from "./mesh-routes.js";
export * from "./openorg-did.js";
export {
  govGatewayProfileIdSchema,
  govGatewayWitnessModeSchema,
  govGatewayPeerBindingSchema,
  peerEndpointGovGatewaySchema,
  govGatewayAuditBridgeSchema,
  govGatewayProfileBindingSchema,
  govGatewayConfigSchema,
  govGatewayRegistryEntrySchema,
  govGatewayRegistrySchema,
} from "./gov-gateway-adapter.js";
export type {
  GovGatewayProfileId,
  GovGatewayWitnessMode,
  GovGatewayConfig,
  GovGatewayRegistry,
  GovGatewayPeerBinding,
  GovGatewayProfileBinding,
} from "./gov-gateway-adapter.js";
export * from "./gov-gateway-profile.js";
export * from "./wire-message.js";
export * from "./wire-gateway-internal.js";
export * from "./wire-gateway-config.js";
export * from "./wire-gateway-audit.js";
export * from "./wire-export-policy.js";
export * from "./wire-trust-registry.js";
export * from "./delivery-attempt.js";
export * from "./wire-node-governance.js";
export * from "./org-certificate-attestation.js";

// Logical public boundaries. Direct exports above are retained for compatibility.
export * as protocolCore from "./core/index.js";
export * as protocolTransport from "./transport/index.js";
export * as protocolDistribution from "./distribution/index.js";
export * as protocolAdapters from "./adapters/index.js";
export * as protocolCompatibility from "./compatibility.js";
