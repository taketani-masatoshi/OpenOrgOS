import { validateWireTrustRegistry } from "./wire-trust-registry.js";
import { validateTrustedHubsRegistry } from "./trusted-hubs.js";
import { validateWireGatewayConfig, loadWireGatewayConfig } from "../wire-gateway/validate.js";
import { validateProtocolState } from "./validate.js";
import { validateGovGatewaySetup, loadGovGatewayConfig } from "../wire/gov-gateway/config.js";
import { setTenantId } from "../tenant.js";

export interface ProdWireGateCheck {
  id: string;
  ok: boolean;
  detail: string;
  issues?: string[];
}

export interface ProdWireGateOptions {
  tenantId: string;
  strictTrust?: boolean;
  strictTls?: boolean;
  strictTransport?: boolean;
  govLive?: boolean;
  publicBaseUrl?: string;
}

export interface ProdWireGateResult {
  ok: boolean;
  checks: ProdWireGateCheck[];
}

function formatIssues(items: Array<{ code: string; message: string }>): string[] {
  return items.map((i) => `${i.code}: ${i.message}`);
}

export function runProdWireGate(opts: ProdWireGateOptions): ProdWireGateResult {
  const previousTenant = process.env.ORGOS_TENANT;
  const prevTrust = process.env.ORGOS_STRICT_TRUST;
  const prevTls = process.env.ORGOS_STRICT_TLS;
  const prevTransport = process.env.ORGOS_STRICT_TRANSPORT;
  const prevGovTransport = process.env.GOV_GATEWAY_TRANSPORT;
  const prevExternalTls = process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY;
  const prevPublic = process.env.PUBLIC_BASE_URL;

  setTenantId(opts.tenantId);
  if (opts.strictTrust) process.env.ORGOS_STRICT_TRUST = "1";
  if (opts.strictTls) process.env.ORGOS_STRICT_TLS = "1";
  if (opts.strictTransport) process.env.ORGOS_STRICT_TRANSPORT = "1";
  if (opts.govLive) process.env.GOV_GATEWAY_TRANSPORT = "live";
  if (opts.publicBaseUrl) process.env.PUBLIC_BASE_URL = opts.publicBaseUrl;

  const checks: ProdWireGateCheck[] = [];

  try {
    const trust = validateWireTrustRegistry();
    checks.push({
      id: "trust_registry",
      ok: trust.ok,
      detail: trust.ok ? "wire trust registry OK" : "wire trust registry failed",
      issues: formatIssues([...trust.issues, ...trust.warnings]),
    });

    const hubs = validateTrustedHubsRegistry();
    checks.push({
      id: "trusted_hubs",
      ok: hubs.ok,
      detail: hubs.ok ? "trusted hubs OK" : "trusted hubs failed",
      issues: formatIssues([...hubs.issues, ...hubs.warnings]),
    });

    const gateway = validateWireGatewayConfig(loadWireGatewayConfig(), {
      publicBaseUrl: opts.publicBaseUrl ?? process.env.PUBLIC_BASE_URL,
    });
    checks.push({
      id: "wire_gateway",
      ok: gateway.ok,
      detail: gateway.ok ? "wire gateway config OK" : "wire gateway config failed",
      issues: formatIssues([...gateway.issues, ...gateway.warnings]),
    });

    const protocol = validateProtocolState({ standalone: true });
    checks.push({
      id: "protocol_transport",
      ok: protocol.ok,
      detail: protocol.ok ? "protocol validate OK" : "protocol validate failed",
      issues: formatIssues(protocol.issues),
    });

    const gov = validateGovGatewaySetup(loadGovGatewayConfig());
    checks.push({
      id: "gov_gateway",
      ok: gov.ok,
      detail: gov.ok ? "gov gateway config OK" : "gov gateway config failed",
      issues: formatIssues(gov.issues),
    });
  } finally {
    if (previousTenant) setTenantId(previousTenant);
    if (prevTrust === undefined) delete process.env.ORGOS_STRICT_TRUST;
    else process.env.ORGOS_STRICT_TRUST = prevTrust;
    if (prevTls === undefined) delete process.env.ORGOS_STRICT_TLS;
    else process.env.ORGOS_STRICT_TLS = prevTls;
    if (prevTransport === undefined) delete process.env.ORGOS_STRICT_TRANSPORT;
    else process.env.ORGOS_STRICT_TRANSPORT = prevTransport;
    if (prevGovTransport === undefined) delete process.env.GOV_GATEWAY_TRANSPORT;
    else process.env.GOV_GATEWAY_TRANSPORT = prevGovTransport;
    if (prevExternalTls === undefined) delete process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY;
    else process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY = prevExternalTls;
    if (prevPublic === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prevPublic;
  }

  const ok = checks.every((c) => c.ok);
  return { ok, checks };
}
