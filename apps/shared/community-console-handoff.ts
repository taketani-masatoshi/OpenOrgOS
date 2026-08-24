const DEFAULT_COMMUNITY_ORIGIN = "https://community.oorgos.org";

function readViteCommunityOrigin(): string | undefined {
  try {
    const env = (import.meta as { env?: { VITE_ORGOS_COMMUNITY_ORIGIN?: string } }).env;
    const raw = env?.VITE_ORGOS_COMMUNITY_ORIGIN?.trim();
    return raw || undefined;
  } catch {
    return undefined;
  }
}

/** Community origin for Operator Console SSO start (My Page → /ops/console/start). */
export function communityConsoleOrigin(): string {
  return (readViteCommunityOrigin() ?? DEFAULT_COMMUNITY_ORIGIN).replace(/\/+$/, "");
}

/**
 * Build Community URL that signs the user in and returns to Operator Console `next` path.
 * Matches Community `consoleStartHref` (/ops/console/start?next=…).
 */
export function buildCommunityConsoleStartUrl(nextPath = "/settings/"): string {
  const next =
    nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/settings/";
  return `${communityConsoleOrigin()}/ops/console/start?next=${encodeURIComponent(next)}`;
}
