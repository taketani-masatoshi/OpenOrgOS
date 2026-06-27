import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  protocolApiClientConfigSchema,
  protocolApiServerConfigSchema,
  type ProtocolApiClientConfig,
  type ProtocolApiServerConfig,
  type ProtocolTlsCredentials,
} from "../../../schemas/protocol/protocol-api-config.js";
import { getProtocolDataDir } from "./paths.js";
import { readYamlFile } from "../utils.js";

export function getProtocolApiClientConfigPath(): string {
  return join(getProtocolDataDir(), "protocol-api-client.yaml");
}

export function loadProtocolApiClientConfig(): ProtocolApiClientConfig {
  const path = getProtocolApiClientConfigPath();
  if (!existsSync(path)) {
    return protocolApiClientConfigSchema.parse({});
  }
  return readYamlFile(path, protocolApiClientConfigSchema);
}

export function mergeTlsCredentials(
  base?: ProtocolTlsCredentials,
  override?: Partial<ProtocolTlsCredentials>
): ProtocolTlsCredentials | undefined {
  if (!base && !override?.cert_path && !override?.ca_path) return undefined;
  return {
    cert_path: override?.cert_path ?? base?.cert_path,
    key_path: override?.key_path ?? base?.key_path,
    ca_path: override?.ca_path ?? base?.ca_path,
    reject_unauthorized: override?.reject_unauthorized ?? base?.reject_unauthorized ?? true,
  };
}

export function buildProtocolApiServerConfig(opts: {
  host?: string;
  port?: number;
  tlsCert?: string;
  tlsKey?: string;
  tlsCa?: string;
  mtlsRequired?: boolean;
  mtlsAllowedOrgUris?: string[];
}): ProtocolApiServerConfig {
  const tls =
    opts.tlsCert && opts.tlsKey
      ? {
          cert_path: opts.tlsCert,
          key_path: opts.tlsKey,
          ca_path: opts.tlsCa,
          reject_unauthorized: true,
        }
      : undefined;

  return protocolApiServerConfigSchema.parse({
    host: opts.host ?? "127.0.0.1",
    port: opts.port ?? 9476,
    tls,
    mtls_required: opts.mtlsRequired ?? false,
    mtls_allowed_org_uris: opts.mtlsAllowedOrgUris ?? [],
    trust_bundle_public: true,
  });
}
