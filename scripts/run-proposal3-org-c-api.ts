#!/usr/bin/env node
/**
 * Proposal 3 — Org C Protocol API daemon (HTTPS + mTLS on relay/inbox/outbox).
 */
import { runProtocolApiServe } from "../src/commands/protocol.js";
import { loadOrgCServerTlsMetadata } from "../src/lib/protocol/tls-pki.js";
import { setTenantId } from "../src/lib/tenant.js";

const orgC = process.env.ORGOS_ORG_C_TENANT ?? process.argv[2] ?? "aiac";
setTenantId(orgC);

const meta = loadOrgCServerTlsMetadata(orgC);
await runProtocolApiServe({
  tenant: orgC,
  host: process.env.PROTOCOL_API_HOST ?? "127.0.0.1",
  port: Number(process.env.PROTOCOL_API_PORT ?? process.env.DEMO_ORG_C_API_PORT ?? 9486),
  tlsCert: meta.server_cert_path,
  tlsKey: meta.server_key_path,
  tlsCa: meta.ca_path,
  mtlsRequired: true,
  mtlsAllowedOrg: meta.mtls_allowed_org_uris,
});
