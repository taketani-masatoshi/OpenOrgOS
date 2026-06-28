import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getWorkspaceRoot, getAppsDir } from "../orgos-paths.js";

export const WIRE_CONSOLE_DEFAULT_PORT = 9470;

export function getOrgOsStateDir(): string {
  return join(getWorkspaceRoot(), ".orgos");
}

export function getWireConsoleManifestPath(): string {
  return join(getOrgOsStateDir(), "wire-console.json");
}

export function getWireConsoleWebauthnSmokeFixture(): string {
  return join(getOrgOsStateDir(), "wire-console-webauthn-smoke.json");
}

export function getWireConsoleOidcSmokeFixture(): string {
  return join(getOrgOsStateDir(), "wire-console-oidc-smoke.json");
}

export function getWireConsoleWebauthnCredentialsPath(): string {
  return join(getOrgOsStateDir(), "wire-console-webauthn-credentials.json");
}

export function getWireConsoleSpaDist(): string {
  return join(getAppsDir(), "wire-console", "dist");
}

/** @deprecated Use getOrgOsStateDir() */
export const ORGOS_STATE_DIR = getOrgOsStateDir();

/** @deprecated Use getWireConsoleManifestPath() */
export const WIRE_CONSOLE_MANIFEST_PATH = getWireConsoleManifestPath();

/** @deprecated Use getWireConsoleWebauthnSmokeFixture() */
export const WIRE_CONSOLE_WEBAUTHN_SMOKE_FIXTURE = getWireConsoleWebauthnSmokeFixture();

/** @deprecated Use getWireConsoleOidcSmokeFixture() */
export const WIRE_CONSOLE_OIDC_SMOKE_FIXTURE = getWireConsoleOidcSmokeFixture();

/** @deprecated Use getWireConsoleWebauthnCredentialsPath() */
export const WIRE_CONSOLE_WEBAUTHN_CREDENTIALS_PATH = getWireConsoleWebauthnCredentialsPath();

/** @deprecated Use getWireConsoleSpaDist() */
export const WIRE_CONSOLE_SPA_DIST = getWireConsoleSpaDist();

export function ensureOrgOsStateDir(): void {
  const dir = getOrgOsStateDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
