/** Protocol API server command handlers. */
import { applyProtocolTenant } from "./shared.js";
import { join } from "node:path";


export interface ProtocolApiServeOptions {
  host?: string;
  port?: number;
  tenant?: string;
  tlsCert?: string;
  tlsKey?: string;
  tlsCa?: string;
  mtlsRequired?: boolean;
  mtlsAllowedOrg?: string[];
}

export async function runProtocolApiServe(opts: ProtocolApiServeOptions): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { startProtocolApiServer } = await import("../../lib/protocol/adapters/protocol-api-server.js");
  const { buildProtocolApiServerConfig } = await import("../../lib/protocol/transport/protocol-api-config.js");
  const config = buildProtocolApiServerConfig({
    host: opts.host,
    port: opts.port,
    tlsCert: opts.tlsCert,
    tlsKey: opts.tlsKey,
    tlsCa: opts.tlsCa,
    mtlsRequired: opts.mtlsRequired,
    mtlsAllowedOrgUris: opts.mtlsAllowedOrg,
  });
  const server = await startProtocolApiServer({ config });
  console.log(`✓ Protocol API ${server.url}`);
  if (config.tls) console.log("  TLS: enabled · trust bundle over HTTPS");
  if (config.mtls_required) {
    console.log(`  mTLS: required on relay/inbox/outbox · allowed: ${config.mtls_allowed_org_uris.join(", ") || "(any authorized client)"}`);
  }
  console.log("  GET /protocol/v1/trust/bundle · /inbox · /outbox · /ledger · /metrics · POST /protocol/v1/relay/enqueue");
  await new Promise<void>(() => {
    /* keep alive until SIGINT */
  });
}

