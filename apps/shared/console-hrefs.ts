/** Standalone Wire Console uses `/`. Combined Operator Console uses `/wire/` (client route in steward-chat SPA). */

function defaultBaseUrl(): string {
  try {
    return import.meta.env?.BASE_URL ?? "/";
  } catch {
    return "/";
  }
}

export function isCombinedWireSpa(baseUrl = defaultBaseUrl()): boolean {
  return baseUrl.replace(/\/+$/, "") === "/wire";
}

export function wireHomeHref(baseUrl = defaultBaseUrl()): string {
  return isCombinedWireSpa(baseUrl) ? "/wire/" : "/";
}

export function isPasskeySettingsPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/settings" || path.endsWith("/settings") || /\/settings\//.test(path);
}
