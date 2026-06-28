export type WireConsoleAuthMode = "dev" | "prod";

export function wireConsoleAuthMode(): WireConsoleAuthMode {
  return process.env.WIRE_CONSOLE_AUTH === "prod" ? "prod" : "dev";
}

export function isDevLoginAllowed(): boolean {
  return wireConsoleAuthMode() === "dev";
}

export interface WireConsoleAuthConfig {
  mode: WireConsoleAuthMode;
  dev_login_allowed: boolean;
  prod_token_required: boolean;
}

export function getWireConsoleAuthConfig(): WireConsoleAuthConfig {
  const mode = wireConsoleAuthMode();
  return {
    mode,
    dev_login_allowed: mode === "dev",
    prod_token_required: mode === "prod",
  };
}
