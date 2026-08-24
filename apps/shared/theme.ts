export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "oorgos-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readCookieValue(cookieHeader: string | null | undefined, key = THEME_STORAGE_KEY): string | null {
  if (!cookieHeader) return null;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cookieHeader.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Cookie wins, then localStorage — same order as THEME_BOOT_SCRIPT. */
export function preferenceFromSources(
  cookieValue: string | null | undefined,
  storageValue: string | null | undefined,
): ThemePreference {
  if (isThemePreference(cookieValue)) return cookieValue;
  if (isThemePreference(storageValue)) return storageValue;
  return "system";
}

export function readThemePreference(): ThemePreference {
  try {
    return preferenceFromSources(
      readCookieValue(document.cookie),
      window.localStorage.getItem(THEME_STORAGE_KEY),
    );
  } catch {
    return "system";
  }
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return preference;
}

export function themeCookieDomain(hostname: string): string | undefined {
  const host = hostname.toLowerCase();
  if (host === "oorgos.org" || host.endsWith(".oorgos.org")) return ".oorgos.org";
  return undefined;
}

export function themeCookieSetter(
  preference: ThemePreference,
  hostname: string,
  protocol: string,
): string {
  const parts = [
    `${THEME_STORAGE_KEY}=${preference}`,
    "path=/",
    `max-age=${THEME_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ];
  const domain = themeCookieDomain(hostname);
  if (domain) parts.push(`Domain=${domain}`);
  if (protocol === "https:") parts.push("Secure");
  return parts.join(";");
}

function persistThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* private mode / quota */
  }
  try {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    if (themeCookieDomain(hostname)) {
      document.cookie = `${THEME_STORAGE_KEY}=;path=/;max-age=0`;
    }
    document.cookie = themeCookieSetter(preference, hostname, protocol);
  } catch {
    /* cookie blocked */
  }
}

export function applyThemePreference(preference: ThemePreference): void {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", preference);
  root.style.colorScheme = resolved;
  persistThemePreference(preference);
}

export const THEME_BOOT_SCRIPT = `(function(){var k=${JSON.stringify(THEME_STORAGE_KEY)},p="system";try{var c=document.cookie.match(new RegExp("(?:^|; )"+k+"=([^;]*)"));if(c)p=decodeURIComponent(c[1]);else{var s=localStorage.getItem(k);if(s)p=s}}catch(e){}if(p!=="light"&&p!=="dark"&&p!=="system")p="system";var r=p==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;var el=document.documentElement;el.setAttribute("data-theme",r);el.setAttribute("data-theme-pref",p);el.style.colorScheme=r})();`;
