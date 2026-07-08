/**
 * OrgOS CLI branding — product rename from Steward OS (2026-06-28).
 * Legacy `steward` binary and STEWARD_* env vars remain supported.
 */
import { basename } from "node:path";

export const ORGOS_PACKAGE_NAME = "orgos-reference";
export const ORGOS_CLI_NAME = "orgos";
export const LEGACY_CLI_NAME = "steward";

export const ORGOS_TENANT_ENV = "ORGOS_TENANT";
export const LEGACY_TENANT_ENV = "STEWARD_TENANT";

/** User-facing command hint (npm scripts). */
export const ORGOS_CLI_INVOCATION = "npm run orgos --";

/** @deprecated Use ORGOS_CLI_INVOCATION */
export const LEGACY_CLI_INVOCATION = "npm run steward --";

export function resolveTenantFromEnv(): string | undefined {
  const primary = process.env[ORGOS_TENANT_ENV]?.trim();
  if (primary) return primary;
  return process.env[LEGACY_TENANT_ENV]?.trim();
}

export function setTenantEnv(tenantId: string): void {
  process.env[ORGOS_TENANT_ENV] = tenantId;
  process.env[LEGACY_TENANT_ENV] = tenantId;
}

export function cliInvocation(): string {
  return ORGOS_CLI_INVOCATION;
}

export function isLegacyCliInvocation(): boolean {
  const invoked = basename(process.argv[1] ?? "");
  if (invoked === LEGACY_CLI_NAME) return true;
  const npmScript = process.env.npm_lifecycle_event;
  return npmScript === LEGACY_CLI_NAME;
}

export function maybeWarnLegacyCli(): void {
  if (process.env.ORGOS_SUPPRESS_LEGACY_WARN === "1") return;
  if (!isLegacyCliInvocation()) return;
  console.warn(
    `[orgos] \`${LEGACY_CLI_NAME}\` CLI is deprecated — use \`${ORGOS_CLI_NAME}\` (${ORGOS_CLI_INVOCATION}). See docs/org-os/cli-migration.md`
  );
}

export const ORGOS_PRODUCT_NAME = "OrgOS";
export const ORGOS_PRODUCT_TAGLINE = "Organizational OS — reference implementation";
