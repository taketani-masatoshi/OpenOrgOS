/** Server-side locale cookies — keep free of apps/shared (browser imports). */

export const LOCALE_STORAGE_KEY = "oorgos-locale";
export const COMMUNITY_LOCALE_COOKIE = "locale";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type UiLocale = "ja" | "en";

export function isUiLocale(value: string | null | undefined): value is UiLocale {
  return value === "ja" || value === "en";
}

export function uiLocaleFromCommunityCookie(
  value: string | null | undefined,
): UiLocale | null {
  if (isUiLocale(value)) return value;
  if (value === "ja") return "ja";
  if (value && value.length > 0) return "en";
  return null;
}

function localeCookieDomain(hostname: string): string | undefined {
  const host = hostname.toLowerCase();
  if (host === "oorgos.org" || host.endsWith(".oorgos.org")) return ".oorgos.org";
  return undefined;
}

function localeCookieParts(
  name: string,
  value: string,
  hostname: string,
  secure: boolean,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${LOCALE_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ];
  const domain = localeCookieDomain(hostname);
  if (domain) parts.push(`Domain=${domain}`);
  if (secure) parts.push("Secure");
  return parts.join(";");
}

export function localeCookieHeaders(
  uiLocale: UiLocale,
  hostname: string,
  secure: boolean,
): string[] {
  return [
    localeCookieParts(LOCALE_STORAGE_KEY, uiLocale, hostname, secure),
    localeCookieParts(COMMUNITY_LOCALE_COOKIE, uiLocale, hostname, secure),
  ];
}
