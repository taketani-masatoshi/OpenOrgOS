import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  wireGatewayConfigSchema,
  type WireGatewayConfig,
} from "../../../schemas/protocol/wire-gateway-config.js";
import {
  wireMessageSchema,
  type WireMessage,
} from "../../../schemas/protocol/wire-message.js";
import {
  internalWireInboxSubmitSchema,
  internalWireDeliveryReportSchema,
} from "../../../schemas/protocol/wire-gateway-internal.js";
import {
  isOpenOrgDid,
  isPkDidRequired,
  isPkPrefixedOpenOrgDid,
} from "../../../schemas/protocol/openorg-did.js";
import { readYamlFile } from "../utils.js";
import { getProtocolDataDir } from "../protocol/paths.js";
import { assertWireHashMatchesEnvelope } from "./codec.js";
import { buildWireNodeIdentityFields } from "./did.js";
import { loadWireTrustRegistry } from "../protocol/wire-trust-registry.js";

export function getWireGatewayYamlPath(): string {
  return join(getProtocolDataDir(), "wire-gateway.yaml");
}

export function loadWireGatewayConfig(): WireGatewayConfig | null {
  const path = getWireGatewayYamlPath();
  if (!existsSync(path)) return null;
  return readYamlFile(path, wireGatewayConfigSchema);
}

export interface WireGatewayValidateIssue {
  code: string;
  message: string;
  path?: string;
}

export function validateWireGatewayConfig(
  config?: WireGatewayConfig | null,
  opts?: { publicBaseUrl?: string }
): {
  ok: boolean;
  issues: WireGatewayValidateIssue[];
  warnings: WireGatewayValidateIssue[];
} {
  const issues: WireGatewayValidateIssue[] = [];
  const warnings: WireGatewayValidateIssue[] = [];
  const cfg = config ?? loadWireGatewayConfig();

  if (!cfg) {
    issues.push({
      code: "config_missing",
      message: `wire-gateway.yaml not found at ${getWireGatewayYamlPath()}`,
    });
    return { ok: false, issues, warnings };
  }

  try {
    wireGatewayConfigSchema.parse(cfg);
  } catch (e) {
    issues.push({
      code: "config_invalid",
      message: e instanceof Error ? e.message : String(e),
      path: getWireGatewayYamlPath(),
    });
    return { ok: false, issues, warnings };
  }

  if (!cfg.internal_api.bearer_token_file && !cfg.internal_api.bearer_token) {
    issues.push({
      code: "internal_auth_missing",
      message: "internal_api requires bearer_token_file or bearer_token",
    });
  }

  if (cfg.listen.tls_cert && !cfg.listen.tls_key) {
    issues.push({
      code: "tls_incomplete",
      message: "listen.tls_key required when tls_cert is set",
    });
  }

  if (cfg.did) {
    if (!isOpenOrgDid(cfg.did)) {
      issues.push({
        code: "invalid-did",
        message: `wire-gateway did is not OpenOrg format: ${cfg.did}`,
        path: "did",
      });
    } else if (isPkDidRequired() && !isPkPrefixedOpenOrgDid(cfg.did)) {
      issues.push({
        code: "slug-did-disallowed",
        message: `${cfg.node_id}: pk-DID required (ORGOS_REQUIRE_PK_DID / ORGOS_STRICT_TRUST) — run wire-gateway did init --force`,
        path: "did",
      });
    }
  } else if (isPkDidRequired()) {
    issues.push({
      code: "did-missing",
      message: `${cfg.node_id}: wire-gateway did required under pk-DID enforcement — run wire-gateway did init`,
      path: "did",
    });
  }

  const publicBase =
    opts?.publicBaseUrl ??
    process.env.PUBLIC_BASE_URL ??
    process.env.WIRE_GATEWAY_PUBLIC_BASE_URL;
  const externalTls =
    process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY === "1";
  if (
    publicBase?.startsWith("https://") &&
    !cfg.listen.tls_cert &&
    !externalTls
  ) {
    const item = {
      code: "https_without_local_tls",
      message:
        "public URL is https but listen.tls_cert unset — use reverse proxy (set WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1) or configure tls_cert/tls_key",
      path: "listen.tls_cert",
    };
    if (process.env.ORGOS_STRICT_TLS === "1") issues.push(item);
    else warnings.push(item);
  }

  return { ok: issues.length === 0, issues, warnings };
}

export function validateWireMessage(
  wire: unknown,
  options?: { verifyHash?: boolean }
): { ok: boolean; message?: WireMessage; issues: WireGatewayValidateIssue[] } {
  const issues: WireGatewayValidateIssue[] = [];
  const parsed = wireMessageSchema.safeParse(wire);
  if (!parsed.success) {
    return {
      ok: false,
      issues: [{ code: "schema_invalid", message: parsed.error.message }],
    };
  }

  if (options?.verifyHash) {
    try {
      assertWireHashMatchesEnvelope(parsed.data);
    } catch (e) {
      issues.push({
        code: "hash_mismatch",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    ok: issues.length === 0,
    message: parsed.data,
    issues,
  };
}

export function validateInternalInboxSubmit(body: unknown): {
  ok: boolean;
  issues: WireGatewayValidateIssue[];
} {
  const parsed = internalWireInboxSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      issues: [{ code: "schema_invalid", message: parsed.error.message }],
    };
  }
  return { ok: true, issues: [] };
}

export function validateInternalDeliveryReport(body: unknown): {
  ok: boolean;
  issues: WireGatewayValidateIssue[];
} {
  const parsed = internalWireDeliveryReportSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      issues: [{ code: "schema_invalid", message: parsed.error.message }],
    };
  }
  return { ok: true, issues: [] };
}

export function buildWireNodeWellKnown(
  config: WireGatewayConfig,
  publicBaseUrl: string,
  protocolPublicKey = ""
): import("../../../schemas/protocol/wire-message.js").WireNodeWellKnown {
  const base = publicBaseUrl.replace(/\/$/, "");
  const identity = buildWireNodeIdentityFields(
    config,
    protocolPublicKey,
    config.trust_registry_url ?? loadWireTrustRegistry().publish_url
  );
  return {
    ...identity,
    endpoints: {
      events_push: `${base}/wire/v1/events`,
      events_pull: `${base}/wire/v1/events`,
      health: `${base}/wire/v1/health`,
    },
  };
}
