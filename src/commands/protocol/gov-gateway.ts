/** Government gateway adapter command handlers. */
import { applyProtocolTenant } from "./shared.js";


export interface ProtocolGovGatewayValidateOptions {
  tenant?: string;
  json?: boolean;
}

export async function runProtocolGovGatewayValidate(
  opts: ProtocolGovGatewayValidateOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { validateGovGatewaySetup } = await import("../../lib/wire/gov-gateway/config.js");
  const result = validateGovGatewaySetup();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log("✓ gov-gateway setup valid");
  } else {
    for (const issue of result.issues) {
      console.log(`✗ [${issue.code}] ${issue.message}${issue.path ? ` · ${issue.path}` : ""}`);
    }
  }
  if (!result.ok) process.exit(1);
}

export interface ProtocolGovGatewayEncodeOptions {
  eventId: string;
  profile: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolGovGatewayEncode(
  opts: ProtocolGovGatewayEncodeOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { findEnvelopeFileForWitness } = await import("../../lib/protocol/distribution/witness-client.js");
  const { resolveAdapter } = await import("../../lib/wire/gov-gateway/config.js");
  const { govGatewayProfileIdSchema } = await import("../../../schemas/protocol/gov-gateway-adapter.js");
  const { getTenantId } = await import("../../lib/tenant.js");

  const profileId = govGatewayProfileIdSchema.parse(opts.profile);
  const envelope = findEnvelopeFileForWitness(opts.eventId);
  if (!envelope) {
    console.error(`Envelope not found for event_id ${opts.eventId}`);
    process.exit(1);
  }
  const adapter = resolveAdapter(profileId);
  const native = await adapter.encode(envelope, {
    tenant_id: getTenantId(),
    peer_org_id: envelope.destination?.org_id,
  });
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ...native,
          body: typeof native.body === "string" ? native.body : Buffer.from(native.body).toString("utf-8"),
        },
        null,
        2
      )
    );
    return;
  }
  console.log(`profile: ${native.profile_id}`);
  console.log(`mime: ${native.mime}`);
  console.log(`headers: ${JSON.stringify(native.headers)}`);
  console.log(typeof native.body === "string" ? native.body : Buffer.from(native.body).toString("utf-8"));
}

export interface ProtocolGovGatewayDecodeOptions {
  file: string;
  tenant?: string;
  json?: boolean;
}

export async function runProtocolGovGatewayDecode(
  opts: ProtocolGovGatewayDecodeOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { readFileSync, existsSync } = await import("node:fs");
  const { decodeGovGatewayInbound } = await import("../../lib/wire/gov-gateway/ingest.js");
  const { getTenantId } = await import("../../lib/tenant.js");

  if (!existsSync(opts.file)) {
    console.error(`File not found: ${opts.file}`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(opts.file, "utf-8"));
  const result = await decodeGovGatewayInbound(raw, getTenantId());
  if (!result.ok || !result.envelope) {
    console.error(result.reason ?? "decode failed");
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(result.envelope, null, 2));
    return;
  }
  console.log(`✓ decoded · event_id ${result.envelope.event_id}${result.profile_id ? ` · ${result.profile_id}` : ""}`);
}

export interface ProtocolGovGatewayHealthOptions {
  profile: string;
  tenant?: string;
  live?: boolean;
  json?: boolean;
}

export async function runProtocolGovGatewayHealth(
  opts: ProtocolGovGatewayHealthOptions
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { govGatewaySandboxHealth } = await import("../../lib/wire/gov-gateway/sandbox.js");
  const { govGatewayProfileIdSchema } = await import("../../../schemas/protocol/gov-gateway-adapter.js");
  const profileId = govGatewayProfileIdSchema.parse(opts.profile);
  const health = await govGatewaySandboxHealth(profileId, { live: opts.live });
  if (opts.json) {
    console.log(JSON.stringify(health, null, 2));
  } else if (health.ok) {
    const liveTag = health.live ? " · live" : "";
    const pingTag = health.ping_ms != null ? ` · ${health.ping_ms}ms` : "";
    console.log(`✓ ${health.profile_id}${liveTag} · ${health.detail ?? "ok"}${pingTag}`);
  } else {
    console.log(`✗ ${health.profile_id} · ${health.detail ?? "unhealthy"}`);
  }
  if (!health.ok) process.exit(1);
}

export interface ProtocolGovGatewaySandboxInitOptions {
  tenant?: string;
  force?: boolean;
  json?: boolean;
}

export async function runProtocolGovGatewaySandboxInit(
  opts: ProtocolGovGatewaySandboxInitOptions = {}
): Promise<void> {
  applyProtocolTenant(opts.tenant);
  const { initGovGatewaySandboxConfig } = await import("../../lib/wire/gov-gateway/sandbox.js");
  const path = initGovGatewaySandboxConfig({ force: opts.force });
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, path }, null, 2));
    return;
  }
  console.log(`✓ gov-gateway sandbox config · ${path}`);
  console.log("  Set GOV_XROAD_SECURITY_SERVER_URL / GOV_EGOV_API_BASE_URL / GOV_GE_API_BASE_URL");
  console.log("  Validate: orgos protocol gov-gateway validate");
  console.log("  Live ping: orgos protocol gov-gateway health --profile xroad_v7 --live");
}

