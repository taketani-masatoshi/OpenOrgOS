import { readCookieValue } from "./theme";

export type UiLocale = "ja" | "en";

export function dateTimeLocale(locale: UiLocale): string {
  return locale === "en" ? "en-US" : "ja-JP";
}

/** Console UI preference — shared with Community via Domain=.oorgos.org when applicable. */
export const LOCALE_STORAGE_KEY = "oorgos-locale";
/** Community full locale cookie (ja/en/de/…); Console maps non-ja → en. */
export const COMMUNITY_LOCALE_COOKIE = "locale";
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

/** Prefer oorgos-locale, then locale (Community), then legacy oorgos-lang. */
export function readUiLocale(): UiLocale {
  try {
    const cookiePrimary = readCookieValue(document.cookie, LOCALE_STORAGE_KEY);
    const cookieCommunity = readCookieValue(document.cookie, COMMUNITY_LOCALE_COOKIE);
    const cookieLegacy = readCookieValue(document.cookie, "oorgos-lang");
    const storagePrimary = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const storageCommunity = window.localStorage.getItem(COMMUNITY_LOCALE_COOKIE);
    const storageLegacy = window.localStorage.getItem("oorgos-lang");
    if (isUiLocale(cookiePrimary)) return cookiePrimary;
    const fromCommunityCookie = uiLocaleFromCommunityCookie(cookieCommunity);
    if (fromCommunityCookie) return fromCommunityCookie;
    if (isUiLocale(storagePrimary)) return storagePrimary;
    const fromCommunityStorage = uiLocaleFromCommunityCookie(storageCommunity);
    if (fromCommunityStorage) return fromCommunityStorage;
    return localeFromSources(
      cookieLegacy,
      storageLegacy,
    );
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
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "path=/",
    `max-age=${LOCALE_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ];
  const domain = localeCookieDomain(hostname);
  if (domain) parts.push(`Domain=${domain}`);
  if (protocol === "https:") parts.push("Secure");
  return parts.join(";");
}

export function localeCookieSetter(locale: UiLocale, hostname: string, protocol: string): string {
  return localeCookieParts(LOCALE_STORAGE_KEY, locale, hostname, protocol);
}

export function communityLocaleCookieSetter(
  locale: UiLocale,
  hostname: string,
  protocol: string,
): string {
  return localeCookieParts(COMMUNITY_LOCALE_COOKIE, locale, hostname, protocol);
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
      document.cookie = `${COMMUNITY_LOCALE_COOKIE}=;path=/;max-age=0`;
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

export const LOCALE_BOOT_SCRIPT = `(function(){var k=${JSON.stringify(LOCALE_STORAGE_KEY)},c=${JSON.stringify(COMMUNITY_LOCALE_COOKIE)},p=${JSON.stringify(DEFAULT_UI_LOCALE)};function map(v){return v==="ja"?"ja":"en"}try{var m=document.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)"));if(m&&(m[1]==="ja"||m[1]==="en"))p=decodeURIComponent(m[1]);else{m=document.cookie.match(new RegExp("(?:^|; )"+c+"=([^;]*)"));if(m)p=map(decodeURIComponent(m[1]));else{var s=localStorage.getItem(k);if(s==="ja"||s==="en")p=s;else{s=localStorage.getItem(c);if(s)p=map(s)}}}}catch(e){}if(p!=="ja"&&p!=="en")p=${JSON.stringify(DEFAULT_UI_LOCALE)};var el=document.documentElement;el.lang=p;el.setAttribute("data-locale",p)})();`;
