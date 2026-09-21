import { findControlPlaneTenant } from "./ledger-control-plane.js";
import { isProductionEnv } from "./stripe-ops.js";

export function resolvePublicBaseUrl(): string | null {
  const raw =
    process.env.ORGOS_PUBLIC_BASE_URL?.trim() ||
    process.env.STEWARD_CHAT_PUBLIC_URL?.trim() ||
    "";
  return raw || null;
}

export function isLocalhostPublicBase(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Welcome / founder setup URL. Production refuses localhost fallbacks.
 */
export function buildProvisionSetupUrl(input: {
  tenantId: string;
  bootstrapToken: string;
}): string {
  const configured = resolvePublicBaseUrl();
  const prod =
    isProductionEnv() ||
    process.env.WIRE_CONSOLE_AUTH === "prod" ||
    process.env.ORGOS_PROD === "1";

  if (prod) {
    if (!configured) {
      throw new Error(
        "ORGOS_PUBLIC_BASE_URL (https) is required before sending provision mail in production",
      );
    }
    if (!configured.startsWith("https://")) {
      throw new Error("ORGOS_PUBLIC_BASE_URL must use https in production");
    }
    if (isLocalhostPublicBase(configured)) {
      throw new Error("ORGOS_PUBLIC_BASE_URL must not be localhost in production");
    }
  }

  const base = configured || "http://127.0.0.1:8787";
  const setupUrl = new URL(base.replace(/\/$/, "") + "/");
  const tenantHost = findControlPlaneTenant(input.tenantId)?.host?.trim();
  if (tenantHost && !isLocalhostPublicBase(base)) {
    setupUrl.hostname = tenantHost.split(":")[0] ?? tenantHost;
  }
  setupUrl.pathname = "/";
  setupUrl.search = `onboarding=1&bootstrap=${encodeURIComponent(input.bootstrapToken)}`;
  setupUrl.hash = "";
  return setupUrl.toString();
}
