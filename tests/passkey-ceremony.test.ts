import { describe, expect, it } from "vitest";
import {
  buildAuthenticationCeremonyOptions,
  buildRegistrationCeremonyOptions,
  mapCeremonyCredentials,
  resolveCeremonyHints,
} from "../apps/shared/passkey-ceremony.js";

describe("passkey-ceremony SSOT", () => {
  it("login ceremony uses client-device hints", () => {
    expect(resolveCeremonyHints("login")).toEqual(["client-device"]);
    expect(resolveCeremonyHints("login", ["hybrid"])).toEqual(["client-device"]);
  });

  it("settlement ceremony uses hybrid hints", () => {
    expect(resolveCeremonyHints("settlement")).toEqual(["hybrid"]);
    expect(resolveCeremonyHints("settlement", ["client-device"])).toEqual(["hybrid"]);
  });

  it("accepts matching server hints for settlement", () => {
    expect(resolveCeremonyHints("settlement", ["hybrid"])).toEqual(["hybrid"]);
  });

  it("normalizes auth credentials without inferring hints from usb transport", () => {
    const mapped = mapCeremonyCredentials(
      "settlement",
      [{ id: "cred-1", type: "public-key", transports: ["hybrid", "internal", "usb"] }],
      "auth"
    );
    expect(mapped).toEqual([
      { id: "cred-1", type: "public-key", transports: ["hybrid", "internal"] },
    ]);

    const ceremony = buildAuthenticationCeremonyOptions({
      kind: "settlement",
      challenge: "chal",
      rp_id: "localhost",
      timeout: 60_000,
      allow_credentials: [{ id: "cred-1", type: "public-key", transports: ["usb", "hybrid"] }],
    });
    expect(ceremony.hints).toEqual(["hybrid"]);
    expect(ceremony.ceremony_kind).toBe("settlement");
  });

  it("login auth ceremony stays on internal transport", () => {
    const ceremony = buildAuthenticationCeremonyOptions({
      kind: "login",
      challenge: "chal",
      rp_id: "localhost",
      timeout: 60_000,
      allow_credentials: [{ id: "login-cred", type: "public-key", transports: ["internal"] }],
    });
    expect(ceremony.hints).toEqual(["client-device"]);
    expect(ceremony.allow_credentials[0]?.transports).toEqual(["internal"]);
  });

  it("registration ceremony pins kind and hints", () => {
    const reg = buildRegistrationCeremonyOptions("settlement", {
      challenge: "chal",
      rp: { id: "localhost", name: "OrgOS" },
      user: { id: "u", name: "n", displayName: "d" },
      pub_key_cred_params: [{ type: "public-key", alg: -7 }],
      timeout: 60_000,
      exclude_credentials: [{ id: "x", type: "public-key", transports: ["hybrid", "internal", "usb"] }],
      hints: ["client-device"],
    });
    expect(reg.ceremony_kind).toBe("settlement");
    expect(reg.hints).toEqual(["hybrid"]);
    expect(reg.exclude_credentials[0]?.transports).toEqual(["hybrid", "internal"]);
  });
});
