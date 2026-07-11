import { validateWireTrustRegistry } from "./wire-trust-registry.js";
import { validateTrustedHubsRegistry } from "./trusted-hubs.js";
import { validateWireGatewayConfig, loadWireGatewayConfig } from "../wire-gateway/validate.js";
import { validateProtocolState } from "./validate.js";
import { validateGovGatewaySetup, loadGovGatewayConfig } from "../wire/gov-gateway/config.js";
import { setTenantId } from "../tenant.js";
import { existsSync } from "node:fs";
import {
  loadMailConfig,
  resolveWireSmtpCredentials,
  shouldAutoWireScan,
} from "../correspondence/mail-config.js";
import { getMailConfigPath } from "../correspondence/paths.js";
import { listLegacyTransportPeers } from "./peers-migrate-legacy.js";

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
  /** Peer-less tenant only — mal production pilot uses witness pool. */
  standalone?: boolean;
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
  const prevRequirePk = process.env.ORGOS_REQUIRE_PK_DID;

  setTenantId(opts.tenantId);
  if (opts.strictTrust) {
    process.env.ORGOS_STRICT_TRUST = "1";
    process.env.ORGOS_REQUIRE_PK_DID = "1";
  }
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

    const protocol = validateProtocolState({ standalone: opts.standalone === true });
    checks.push({
      id: "protocol_transport",
      ok: protocol.ok,
      detail: protocol.ok ? "protocol validate OK" : "protocol validate failed",
      issues: formatIssues(protocol.issues),
    });

    const legacyPeers = listLegacyTransportPeers();
    const legacyBlocked = opts.strictTransport === true && legacyPeers.length > 0;
    checks.push({
      id: "legacy_webhook_sunset",
      ok: !legacyBlocked,
      detail:
        legacyPeers.length === 0
          ? "no legacy_webhook Wire peers"
          : legacyBlocked
            ? `legacy_webhook blocked in strict production mode (${legacyPeers.length} peer(s))`
            : `legacy_webhook deprecated until 2026-10-01 (${legacyPeers.length} peer(s))`,
      issues: legacyPeers.length
        ? legacyPeers.map(
            (peer) =>
              `${peer.peer_id}: migrate with orgos wire peer migrate-legacy --to-wire-url <gateway>/wire/v1/events`
          )
        : undefined,
    });

    const gov = validateGovGatewaySetup(loadGovGatewayConfig());
    checks.push({
      id: "gov_gateway",
      ok: gov.ok,
      detail: gov.ok ? "gov gateway config OK" : "gov gateway config failed",
      issues: formatIssues(gov.issues),
    });

    const emailWireReady = evaluateEmailWireReadiness(opts.tenantId);
    checks.push({
      id: "email_wire",
      ok: emailWireReady.ok,
      detail: emailWireReady.detail,
      issues: emailWireReady.issues,
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
    if (prevRequirePk === undefined) delete process.env.ORGOS_REQUIRE_PK_DID;
    else process.env.ORGOS_REQUIRE_PK_DID = prevRequirePk;
  }

  const ok = checks.every((c) => c.ok);
  return { ok, checks };
}

export function evaluateEmailWireReadiness(tenantId: string): {
  ok: boolean;
  detail: string;
  issues?: string[];
} {
  const issues: string[] = [];
  const mailConfigPath = getMailConfigPath();
  if (!existsSync(mailConfigPath)) {
    issues.push("mail-config.yaml not present");
    return {
      ok: false,
      detail: "email_wire not ready",
      issues,
    };
  }

  let config: ReturnType<typeof loadMailConfig>;
  try {
    config = loadMailConfig();
  } catch (error) {
    issues.push(
      `mail-config.yaml invalid: ${error instanceof Error ? error.message : String(error)}`
    );
    return { ok: false, detail: "email_wire not ready", issues };
  }

  if (!config?.wire_outbound?.enabled) {
    issues.push("wire_outbound.enabled must be true");
  }

  const dryRun =
    config?.provider === "dry_run" ||
    config?.wire_outbound?.smtp?.host === "smtp.test.local";
  if (!dryRun) {
    if (!config?.wire_outbound?.smtp?.host) {
      issues.push("wire_outbound.smtp is required outside dry_run");
    }
    if (!resolveWireSmtpCredentials()) {
      issues.push("wire SMTP credentials are missing");
    }
  }

  if (!config || !shouldAutoWireScan(config)) {
    issues.push(
      "receive sync must be imap/gmail_api with auto_wire_scan enabled for inbound ingest"
    );
  }

  return {
    ok: issues.length === 0,
    detail: issues.length === 0 ? `email_wire ready (${tenantId})` : "email_wire not ready",
    issues: issues.length ? issues : undefined,
  };
}
