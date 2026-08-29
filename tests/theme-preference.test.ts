import { describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  themeCookieDomain,
  themeCookieSetter,
} from "../apps/shared/theme.js";
import { prefersJapaneseLocale } from "../apps/shared/ui-locale.js";
import {
  DEFAULT_UI_LOCALE,
  LOCALE_STORAGE_KEY,
  COMMUNITY_LOCALE_COOKIE,
  localeCookieSetter,
  communityLocaleCookieSetter,
  localeFromSources,
  uiLocaleFromCommunityCookie,
} from "../apps/shared/locale.js";
import {
  canRegisterLoginPasskey,
  canSignInWithPasskey,
  isWebAuthnIssuanceEnabled,
} from "../apps/shared/webauthn-issuance.js";
import {
  isCombinedWireSpa,
  isPasskeySettingsPath,
  wireHomeHref,
} from "../apps/shared/console-hrefs.js";

describe("themeCookieDomain", () => {
  it("shares oorgos.org subdomains", () => {
    expect(themeCookieDomain("oorgos.org")).toBe(".oorgos.org");
    expect(themeCookieDomain("community.oorgos.org")).toBe(".oorgos.org");
    expect(themeCookieDomain("approve.oorgos.org")).toBe(".oorgos.org");
    expect(themeCookieDomain("receipt.oorgos.org")).toBe(".oorgos.org");
  });

  it("keeps localhost host-only", () => {
    expect(themeCookieDomain("localhost")).toBeUndefined();
    expect(themeCookieDomain("127.0.0.1")).toBeUndefined();
  });
});

describe("themeCookieSetter", () => {
  it("sets Domain and Secure on production HTTPS", () => {
    const cookie = themeCookieSetter("dark", "community.oorgos.org", "https:");
    expect(cookie).toContain("Domain=.oorgos.org");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain(`${THEME_STORAGE_KEY}=dark`);
  });

  it("omits Domain on localhost HTTP", () => {
    const cookie = themeCookieSetter("light", "localhost", "http:");
    expect(cookie).not.toContain("Domain=");
    expect(cookie).not.toContain("Secure");
  });
});

describe("prefersJapaneseLocale", () => {
  it("follows an explicit languages list", () => {
    expect(prefersJapaneseLocale(["ja-JP", "en"])).toBe(true);
    expect(prefersJapaneseLocale(["en-US"])).toBe(false);
  });
});

describe("ui locale preference", () => {
  it("defaults to Japanese when nothing is stored", () => {
    expect(DEFAULT_UI_LOCALE).toBe("ja");
    expect(localeFromSources(null, null)).toBe("ja");
  });

  it("lets the stored locale override the default", () => {
    expect(localeFromSources("en", "ja")).toBe("en");
    expect(localeFromSources(null, "en")).toBe("en");
    const cookie = localeCookieSetter("en", "localhost", "http:");
    expect(cookie).toContain(`${LOCALE_STORAGE_KEY}=en`);
    expect(cookie).not.toContain("Domain=");
  });

  it("maps Community locale cookie to Console UI locale", () => {
    expect(uiLocaleFromCommunityCookie("ja")).toBe("ja");
    expect(uiLocaleFromCommunityCookie("de")).toBe("en");
    expect(uiLocaleFromCommunityCookie(null)).toBeNull();
  });

  it("sets paired Community locale cookie on oorgos.org", () => {
    const cookie = communityLocaleCookieSetter("ja", "operator.oorgos.org", "https:");
    expect(cookie).toContain(`${COMMUNITY_LOCALE_COOKIE}=ja`);
    expect(cookie).toContain("Domain=.oorgos.org");
  });
});

describe("webauthn issuance gate", () => {
  it("treats a present webauthn block as issuable after login", () => {
    expect(isWebAuthnIssuanceEnabled({ webauthn: { rp_id: "localhost" } })).toBe(true);
    expect(isWebAuthnIssuanceEnabled({ webauthn: undefined })).toBe(false);
    expect(canRegisterLoginPasskey({ registration_allowed: true }, 0)).toBe(true);
    expect(canRegisterLoginPasskey({ registration_allowed: true }, 1)).toBe(false);
    expect(
      canRegisterLoginPasskey(
        { registration_allowed: true, additional_login_registration_allowed: true },
        1,
      ),
    ).toBe(true);
    expect(canSignInWithPasskey({ webauthn: { credential_count: 0 } })).toBe(false);
    expect(canSignInWithPasskey({ webauthn: { credential_count: 1 } })).toBe(true);
  });
});

describe("console hrefs", () => {
  it("uses /wire/ only on the combined Wire SPA", () => {
    expect(isCombinedWireSpa("/wire/")).toBe(true);
    expect(wireHomeHref("/wire/")).toBe("/wire/");
    expect(isCombinedWireSpa("/")).toBe(false);
    expect(wireHomeHref("/")).toBe("/");
  });

  it("recognizes PassKey settings on both origins", () => {
    expect(isPasskeySettingsPath("/settings/")).toBe(true);
    expect(isPasskeySettingsPath("/wire/settings")).toBe(true);
    expect(isPasskeySettingsPath("/wire/")).toBe(false);
  });
});
