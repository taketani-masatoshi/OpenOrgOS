import {
  ELTAX_PACKAGE_SCHEMA,
  ETAX_PACKAGE_SCHEMA,
  type FilingChannel,
  type FilingPackageSchemaId,
} from "../../../schemas/efiling/filing.js";
import { filingError } from "./errors.js";

export function schemaForChannel(channel: FilingChannel): FilingPackageSchemaId {
  return channel === "etax" ? ETAX_PACKAGE_SCHEMA : ELTAX_PACKAGE_SCHEMA;
}

export function channelForSchema(schema: string): FilingChannel | undefined {
  if (schema === ETAX_PACKAGE_SCHEMA) return "etax";
  if (schema === ELTAX_PACKAGE_SCHEMA) return "eltax";
  return undefined;
}

export function assertTransportChannel(transportChannel: FilingChannel, packageChannel: FilingChannel): void {
  if (transportChannel !== packageChannel) {
    throw filingError(
      "EFILING_TRANSPORT_CHANNEL",
      `${transportChannel} transport cannot send a ${packageChannel} package`,
      "SPEC_BLOCKED",
    );
  }
}

export function assertSignatureChannel(signatureChannel: FilingChannel, packageChannel: FilingChannel): void {
  if (signatureChannel !== packageChannel) {
    throw filingError(
      "EFILING_SIGNATURE_CHANNEL",
      `${signatureChannel} signature catalog cannot sign a ${packageChannel} package`,
      "SPEC_BLOCKED",
    );
  }
}

export function assertSpecChannel(specChannel: FilingChannel, packageChannel: FilingChannel): void {
  if (specChannel !== packageChannel) {
    throw filingError(
      "EFILING_SPEC_CHANNEL",
      `${specChannel} specification registry cannot describe a ${packageChannel} package`,
      "SPEC_BLOCKED",
    );
  }
}
