import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  GovGatewayProfileBinding,
  GovGatewayProfileId,
} from "../../../../schemas/protocol/gov-gateway-adapter.js";
import { STEWARD_PLATFORM_DIR } from "../../steward-paths.js";
import { getGovGatewayYamlPath } from "../../protocol/paths.js";
import {
  findProfileBinding,
  loadGovGatewayConfig,
  resolveAdapter,
} from "./config.js";
import type { AdapterHealth } from "./types.js";

const SANDBOX_ENV: Partial<
  Record<GovGatewayProfileId, { envKey: string; field: "security_server_url" | "api_base_url" }>
> = {
  xroad_v7: { envKey: "GOV_XROAD_SECURITY_SERVER_URL", field: "security_server_url" },
  xroad_v6: { envKey: "GOV_XROAD_SECURITY_SERVER_URL", field: "security_server_url" },
  xroad_v7_dj: { envKey: "GOV_XROAD_SECURITY_SERVER_URL", field: "security_server_url" },
  jp_egov_central: { envKey: "GOV_EGOV_API_BASE_URL", field: "api_base_url" },
  ge_gov_gateway_3g: { envKey: "GOV_GE_API_BASE_URL", field: "api_base_url" },
};

export function resolveSandboxUrl(
  profileId: GovGatewayProfileId,
  binding?: GovGatewayProfileBinding
): string | undefined {
  const mapping = SANDBOX_ENV[profileId];
  if (mapping) {
    const fromEnv = process.env[mapping.envKey]?.trim();
    if (fromEnv) return fromEnv;
    const fromBinding = binding?.[mapping.field]?.trim();
    if (fromBinding && !fromBinding.includes("example.")) return fromBinding;
    return undefined;
  }
  return binding?.security_server_url ?? binding?.api_base_url;
}

const AUTH_TOKEN_ENV: Partial<Record<GovGatewayProfileId, string>> = {
  xroad_v7: "GOV_XROAD_TOKEN",
  xroad_v6: "GOV_XROAD_TOKEN",
  xroad_v7_dj: "GOV_XROAD_TOKEN",
  jp_egov_central: "GOV_EGOV_TOKEN",
  ge_gov_gateway_3g: "GOV_GE_TOKEN",
};

function authHeaders(profileId: GovGatewayProfileId): Record<string, string> {
  const envKey = AUTH_TOKEN_ENV[profileId];
  const token = envKey ? process.env[envKey]?.trim() : undefined;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function pingSandboxEndpoint(
  url: string,
  opts?: { headers?: Record<string, string> }
): Promise<{
  ok: boolean;
  detail: string;
  latencyMs: number;
  httpStatus?: number;
  method?: "HEAD" | "GET";
  body_preview?: string;
}> {
  const headers = opts?.headers ?? {};
  const start = Date.now();

  async function attempt(method: "HEAD" | "GET") {
    const res = await fetch(url, {
      method,
      headers,
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    const latencyMs = Date.now() - start;
    let body_preview: string | undefined;
    if (method === "GET") {
      const text = await res.text().catch(() => "");
      body_preview = text.slice(0, 200);
    }
    const ok = res.status < 500;
    return {
      ok,
      detail: ok ? `reachable HTTP ${res.status} via ${method}` : `HTTP ${res.status} via ${method}`,
      latencyMs,
      httpStatus: res.status,
      method,
      body_preview,
    };
  }

  try {
    const head = await attempt("HEAD");
    // Fall back on method rejection or server error; 2xx/3xx HEAD is enough
    if (head.httpStatus != null && head.httpStatus >= 200 && head.httpStatus < 400) {
      return head;
    }
    return await attempt("GET");
  } catch {
    try {
      return await attempt("GET");
    } catch (e) {
      return {
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        latencyMs: Date.now() - start,
      };
    }
  }
}

export interface GovGatewaySandboxHealth extends AdapterHealth {
  sandbox_url?: string;
  ping_ms?: number;
  live?: boolean;
  http_status?: number;
  method?: "HEAD" | "GET";
  body_preview?: string;
  auth?: boolean;
}

export async function govGatewaySandboxHealth(
  profileId: GovGatewayProfileId,
  opts: { live?: boolean } = {}
): Promise<GovGatewaySandboxHealth> {
  const config = loadGovGatewayConfig();
  const binding = findProfileBinding(config, profileId);
  const adapter = resolveAdapter(profileId, binding);
  const base = await adapter.health();

  if (!opts.live) {
    return base;
  }

  const sandboxUrl = resolveSandboxUrl(profileId, binding);
  if (!sandboxUrl) {
    return {
      ...base,
      ok: false,
      live: true,
      detail: "no sandbox URL — set env (GOV_*_URL) or gov-gateway.yaml binding",
    };
  }

  const headers = authHeaders(profileId);
  const ping = await pingSandboxEndpoint(sandboxUrl, { headers });
  return {
    ...base,
    ok: base.ok && ping.ok,
    live: true,
    sandbox_url: sandboxUrl,
    ping_ms: ping.latencyMs,
    detail: ping.detail,
    http_status: ping.httpStatus,
    method: ping.method,
    body_preview: ping.body_preview,
    auth: Object.keys(headers).length > 0,
  };
}

export function initGovGatewaySandboxConfig(opts?: { force?: boolean }): string {
  const dest = getGovGatewayYamlPath();
  const src = join(
    STEWARD_PLATFORM_DIR,
    "protocol",
    "seed",
    "gov-gateway-live-pilot.yaml.example"
  );
  if (!existsSync(src)) {
    throw new Error(`Seed not found: ${src}`);
  }
  if (existsSync(dest) && !opts?.force) {
    throw new Error(`gov-gateway.yaml already exists at ${dest} (use --force)`);
  }
  mkdirSync(join(dest, ".."), { recursive: true });
  copyFileSync(src, dest);
  return dest;
}
