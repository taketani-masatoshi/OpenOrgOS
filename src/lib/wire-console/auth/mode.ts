export type WireConsoleAuthMode = "dev" | "prod";
export type WireConsoleProdAdapter = "oidc" | "webauthn" | "legacy_token";

export function wireConsoleAuthMode(): WireConsoleAuthMode {
  return process.env.WIRE_CONSOLE_AUTH === "prod" ? "prod" : "dev";
}

export function wireConsoleProdAdapter(): WireConsoleProdAdapter {
  const v = process.env.WIRE_CONSOLE_PROD_ADAPTER;
  if (v === "legacy_token" || v === "webauthn" || v === "oidc") return v;
  return "oidc";
}

export function isLegacyProdTokenAllowed(): boolean {
  return (
    wireConsoleProdAdapter() === "legacy_token" ||
    process.env.WIRE_CONSOLE_ALLOW_LEGACY_PROD_TOKEN === "1"
  );
}

export function isDevLoginAllowed(): boolean {
  return wireConsoleAuthMode() === "dev";
}

export interface WireConsoleAuthConfig {
  mode: WireConsoleAuthMode;
  dev_login_allowed: boolean;
  prod_adapter: WireConsoleProdAdapter;
  legacy_token_allowed: boolean;
  legacy_token_deprecated: boolean;
  oidc?: { issuer: string; audience: string; client_id: string };
  webauthn?: { rp_id: string; credential_count: number };
}

export function getWireConsoleAuthConfig(): WireConsoleAuthConfig {
  const mode = wireConsoleAuthMode();
  const prodAdapter = wireConsoleProdAdapter();
  const legacyAllowed = isLegacyProdTokenAllowed();
  return {
    mode,
    dev_login_allowed: mode === "dev",
    prod_adapter: mode === "prod" ? prodAdapter : "oidc",
    legacy_token_allowed: mode === "prod" && legacyAllowed,
    legacy_token_deprecated: mode === "prod" && prodAdapter !== "legacy_token",
  };
}
