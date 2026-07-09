import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateWireGatewayConfig } from "../src/lib/wire-gateway/validate.js";
import { wireGatewayConfigSchema } from "../schemas/protocol/wire-gateway-config.js";

const baseConfig = wireGatewayConfigSchema.parse({
  node_id: "mal",
  node_uri: "steward://tenant/mal",
  display_name: "MAL Co",
  listen: { host: "127.0.0.1", port: 8443 },
  internal_api: {
    base_url: "http://127.0.0.1:8080/internal/v1/wire",
    bearer_token: "test-token",
  },
  outbound: { poll_interval_ms: 5000 },
  audit: { path: "data/protocol/wire-gateway-audit.jsonl" },
  legacy: { enabled: false },
});

describe("wire-gateway validate (STRICT TLS)", () => {
  const prevTls = process.env.ORGOS_STRICT_TLS;
  const prevExternal = process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY;
  const prevPublic = process.env.PUBLIC_BASE_URL;

  afterEach(() => {
    if (prevTls === undefined) delete process.env.ORGOS_STRICT_TLS;
    else process.env.ORGOS_STRICT_TLS = prevTls;
    if (prevExternal === undefined) delete process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY;
    else process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY = prevExternal;
    if (prevPublic === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prevPublic;
  });

  beforeEach(() => {
    delete process.env.ORGOS_STRICT_TLS;
    delete process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY;
    delete process.env.PUBLIC_BASE_URL;
  });

  it("warns on https public URL without local TLS", () => {
    const result = validateWireGatewayConfig(baseConfig, {
      publicBaseUrl: "https://wire.mal.example",
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.code === "https_without_local_tls")).toBe(true);
  });

  it("ORGOS_STRICT_TLS=1 errors without proxy exemption", () => {
    process.env.ORGOS_STRICT_TLS = "1";
    const result = validateWireGatewayConfig(baseConfig, {
      publicBaseUrl: "https://wire.mal.example",
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "https_without_local_tls")).toBe(true);
  });

  it("WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY=1 passes STRICT TLS", () => {
    process.env.ORGOS_STRICT_TLS = "1";
    process.env.WIRE_GATEWAY_TLS_TERMINATED_EXTERNALLY = "1";
    const result = validateWireGatewayConfig(baseConfig, {
      publicBaseUrl: "https://wire.mal.example",
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("local tls_cert satisfies STRICT TLS", () => {
    process.env.ORGOS_STRICT_TLS = "1";
    const withTls = wireGatewayConfigSchema.parse({
      ...baseConfig,
      listen: { ...baseConfig.listen, tls_cert: "/run/secrets/wire.crt", tls_key: "/run/secrets/wire.key" },
    });
    const result = validateWireGatewayConfig(withTls, {
      publicBaseUrl: "https://wire.mal.example",
    });
    expect(result.ok).toBe(true);
  });
});
