/**
 * Witness-domain command facade for Wire attestations and pool operations.
 */
export {
  runProtocolWitnessRegister,
  runProtocolWitnessFlushPending,
  runProtocolWitnessVerify,
  runProtocolWitnessReconcile,
  runProtocolWitnessPoolStatus,
  runProtocolWitnessPoolInitTrusted,
  runProtocolWitnessPoolInitFromTrust,
  runProtocolWitnessPoolInitFromContract,
  runProtocolWitnessTrustInitAuthority,
  runProtocolWitnessTrustCertify,
  runProtocolWitnessTrustPublish,
  runProtocolWitnessTrustVerify,
  runProtocolWitnessTrustRevoke,
  runProtocolTrustedHubsList,
  runProtocolTrustedHubsValidate,
  runProtocolTrustedHubsSyncKeys,
} from "../protocol.js";

export type {
  ProtocolWitnessRegisterOptions,
  ProtocolWitnessFlushPendingOptions,
  ProtocolWitnessVerifyOptions,
  ProtocolWitnessReconcileOptions,
  ProtocolWitnessPoolStatusOptions,
  ProtocolWitnessPoolInitTrustedOptions,
  ProtocolWitnessPoolInitFromTrustOptions,
  ProtocolWitnessPoolInitFromContractOptions,
  ProtocolWitnessTrustInitAuthorityOptions,
  ProtocolWitnessTrustCertifyOptions,
  ProtocolWitnessTrustPublishOptions,
  ProtocolWitnessTrustVerifyOptions,
  ProtocolWitnessTrustRevokeOptions,
  ProtocolTrustedHubsListOptions,
  ProtocolTrustedHubsValidateOptions,
  ProtocolTrustedHubsSyncKeysOptions,
} from "../protocol.js";
