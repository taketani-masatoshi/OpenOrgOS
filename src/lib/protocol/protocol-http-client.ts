import type { ProtocolTlsCredentials } from "../../../schemas/protocol/protocol-api-config.js";
import { loadProtocolApiClientConfig, mergeTlsCredentials } from "./protocol-api-config.js";

export async function protocolHttpFetch(
  url: string,
  init?: RequestInit & { tlsOverride?: Partial<ProtocolTlsCredentials> }
): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    return fetch(url, init);
  }

  const { protocolFetch } = await import("./protocol-tls.js");
  const client = loadProtocolApiClientConfig();
  const tls = mergeTlsCredentials(client.tls, init?.tlsOverride);
  if (!tls?.ca_path && !tls?.cert_path) {
    throw new Error(
      `HTTPS to ${url} requires tenants/*/data/protocol/protocol-api-client.yaml tls.ca_path`
    );
  }

  const { tlsOverride: _tlsOverride, ...fetchInit } = init ?? {};
  return protocolFetch(url, { ...fetchInit, tls });
}
