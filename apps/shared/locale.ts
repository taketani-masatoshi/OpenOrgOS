import { readCookieValue } from "./theme";

export type UiLocale = "ja" | "en";

export function dateTimeLocale(locale: UiLocale): string {
  return locale === "en" ? "en-US" : "ja-JP";
}

/** Console UI preference — shared with Community via Domain=.oorgos.org when applicable. */
export const LOCALE_STORAGE_KEY = "oorgos-locale";
/** Community full locale cookie (ja/en/de/…); Console maps non-ja → en. Host-only. */
export const COMMUNITY_LOCALE_COOKIE = "oorgos-lang";
/** Pre-2026-08 Community cookie. Expired on write so it cannot pin the UI. */
export const LEGACY_COMMUNITY_LOCALE_COOKIE = "locale";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const DEFAULT_UI_LOCALE: UiLocale = "ja";

const listeners = new Set<() => void>();

export function isUiLocale(value: string | null | undefined): value is UiLocale {
  return value === "ja" || value === "en";
}

export function localeFromSources(
  cookieValue: string | null | undefined,
  storageValue: string | null | undefined,
): UiLocale {
  if (isUiLocale(cookieValue)) return cookieValue;
  if (isUiLocale(storageValue)) return storageValue;
  return DEFAULT_UI_LOCALE;
}

/** Map Community `locale` cookie value to Console UI locale. */
export function uiLocaleFromCommunityCookie(
  value: string | null | undefined,
): UiLocale | null {
  if (isUiLocale(value)) return value;
  if (value === "ja") return "ja";
  if (value && value.length > 0) return "en";
  return null;
}

/** Prefer oorgos-locale, then oorgos-lang (Community), then the legacy locale cookie. */
export function readUiLocale(): UiLocale {
  try {
    const cookiePrimary = readCookieValue(document.cookie, LOCALE_STORAGE_KEY);
    const cookieCommunity = readCookieValue(document.cookie, COMMUNITY_LOCALE_COOKIE);
    const cookieLegacy = readCookieValue(document.cookie, LEGACY_COMMUNITY_LOCALE_COOKIE);
    const storagePrimary = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const storageCommunity = window.localStorage.getItem(COMMUNITY_LOCALE_COOKIE);
    const storageLegacy = window.localStorage.getItem(LEGACY_COMMUNITY_LOCALE_COOKIE);
    if (isUiLocale(cookiePrimary)) return cookiePrimary;
    const fromCommunityCookie =
      uiLocaleFromCommunityCookie(cookieCommunity) ?? uiLocaleFromCommunityCookie(cookieLegacy);
    if (fromCommunityCookie) return fromCommunityCookie;
    if (isUiLocale(storagePrimary)) return storagePrimary;
    const fromCommunityStorage =
      uiLocaleFromCommunityCookie(storageCommunity) ?? uiLocaleFromCommunityCookie(storageLegacy);
    if (fromCommunityStorage) return fromCommunityStorage;
    return DEFAULT_UI_LOCALE;
  } catch {
    return DEFAULT_UI_LOCALE;
  }
}

export function localeCookieDomain(hostname: string): string | undefined {
  const host = hostname.toLowerCase();
  if (host === "oorgos.org" || host.endsWith(".oorgos.org")) return ".oorgos.org";
  return undefined;
}

function localeCookieParts(
  name: string,
  value: string,
  hostname: string,
  protocol: string,
  options?: { shareAcrossSubdomains?: boolean; maxAge?: number },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${options?.maxAge ?? LOCALE_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ];
  const domain = options?.shareAcrossSubdomains ? localeCookieDomain(hostname) : undefined;
  if (domain) parts.push(`Domain=${domain}`);
  if (protocol === "https:") parts.push("Secure");
  return parts.join(";");
}

export function localeCookieSetter(locale: UiLocale, hostname: string, protocol: string): string {
  return localeCookieParts(LOCALE_STORAGE_KEY, locale, hostname, protocol, {
    shareAcrossSubdomains: true,
  });
}

/** Community locale is host-only — a Domain copy would shadow community.oorgos.org. */
export function communityLocaleCookieSetter(
  locale: UiLocale,
  hostname: string,
  protocol: string,
): string {
  return localeCookieParts(COMMUNITY_LOCALE_COOKIE, locale, hostname, protocol);
}

/** Expire the legacy `locale` cookie in every shape it may have been written. */
export function legacyLocaleExpireCookies(hostname: string, protocol: string): string[] {
  const lines = [
    localeCookieParts(LEGACY_COMMUNITY_LOCALE_COOKIE, "", hostname, protocol, { maxAge: 0 }),
  ];
  if (localeCookieDomain(hostname)) {
    lines.push(
      localeCookieParts(LEGACY_COMMUNITY_LOCALE_COOKIE, "", hostname, protocol, {
        shareAcrossSubdomains: true,
        maxAge: 0,
      }),
    );
  }
  return lines;
}

/** HTTP response Set-Cookie lines for cross-surface locale sync. */
export function localeCookieHeaders(
  uiLocale: UiLocale,
  hostname: string,
  secure: boolean,
): string[] {
  const protocol = secure ? "https:" : "http:";
  return [
    localeCookieSetter(uiLocale, hostname, protocol),
    communityLocaleCookieSetter(uiLocale, hostname, protocol),
    ...legacyLocaleExpireCookies(hostname, protocol),
  ];
}

function persistUiLocale(locale: UiLocale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.localStorage.setItem(COMMUNITY_LOCALE_COOKIE, locale);
  } catch {
    /* private mode / quota */
  }
  try {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    if (localeCookieDomain(hostname)) {
      document.cookie = `${LOCALE_STORAGE_KEY}=;path=/;max-age=0`;
    }
    for (const line of legacyLocaleExpireCookies(hostname, protocol)) {
      document.cookie = line;
    }
    document.cookie = localeCookieSetter(locale, hostname, protocol);
    document.cookie = communityLocaleCookieSetter(locale, hostname, protocol);
  } catch {
    /* cookie blocked */
  }
}

export function applyUiLocale(locale: UiLocale): void {
  const root = document.documentElement;
  root.lang = locale;
  root.setAttribute("data-locale", locale);
  persistUiLocale(locale);
  for (const listener of listeners) listener();
}

export function subscribeUiLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const LOCALE_BOOT_SCRIPT = `(function(){var k=${JSON.stringify(LOCALE_STORAGE_KEY)},cs=[${JSON.stringify(COMMUNITY_LOCALE_COOKIE)},${JSON.stringify(LEGACY_COMMUNITY_LOCALE_COOKIE)}],p=${JSON.stringify(DEFAULT_UI_LOCALE)};function map(v){return v==="ja"?"ja":"en"}function ck(n){var m=document.cookie.match(new RegExp("(?:^|; )"+n+"=([^;]*)"));return m?decodeURIComponent(m[1]):null}function ls(n){try{return localStorage.getItem(n)}catch(e){return null}}try{var v=ck(k);if(v==="ja"||v==="en")p=v;else{var f=null,i;for(i=0;i<cs.length&&!f;i+=1){v=ck(cs[i]);if(v)f=map(v)}if(f)p=f;else{v=ls(k);if(v==="ja"||v==="en")p=v;else{for(i=0;i<cs.length&&!f;i+=1){v=ls(cs[i]);if(v)f=map(v)}if(f)p=f}}}}catch(e){}if(p!=="ja"&&p!=="en")p=${JSON.stringify(DEFAULT_UI_LOCALE)};var el=document.documentElement;el.lang=p;el.setAttribute("data-locale",p)})();`;
