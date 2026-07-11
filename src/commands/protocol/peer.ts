/**
 * Peer-domain command facade.
 *
 * The implementation remains re-exported from the historical protocol module
 * during the non-breaking split. New callers should import this domain path.
 */
export {
  runProtocolIdentityExport,
  runProtocolIdentityValidate,
  runProtocolPeerRegister,
  runProtocolPeerDiscover,
  runProtocolPeersMigrateLegacy,
  runProtocolTrustRegistryValidate,
  runProtocolTrustRegistryList,
  runProtocolTrustRegistryResolve,
  runProtocolTrustRegistrySyncKeys,
  runProtocolTrustRegistryPinLocal,
  runProtocolTrustRegistrySubmit,
  runProtocolTrustRegistryDecide,
  runProtocolTrustRegistryPending,
} from "../protocol.js";

export type {
  ProtocolIdentityExportOptions,
  ProtocolIdentityValidateOptions,
  ProtocolPeerRegisterOptions,
  ProtocolPeerDiscoverOptions,
  ProtocolPeersMigrateLegacyOptions,
  ProtocolTrustRegistryValidateOptions,
  ProtocolTrustRegistryListOptions,
  ProtocolTrustRegistryResolveOptions,
  ProtocolTrustRegistrySyncKeysOptions,
  ProtocolTrustRegistryPinLocalOptions,
  ProtocolTrustRegistrySubmitOptions,
  ProtocolTrustRegistryDecideOptions,
  ProtocolTrustRegistryPendingOptions,
} from "../protocol.js";
