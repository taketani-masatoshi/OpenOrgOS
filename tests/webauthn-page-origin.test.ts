import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../apps/shared/webauthn-simple.js", () => ({
  browserSupportsWebAuthn: () => true,
}));

import { inspectWebAuthnPage } from "../apps/shared/webauthn-page-origin.js";

type MockLocation = {
  hostname: string;
  origin: string;
  href: string;
  protocol: string;
  port: string;
  replace: ReturnType<typeof vi.fn>;
};

function installWindow(location: MockLocation, storage: Record<string, string> = {}): void {
  vi.stubGlobal("window", {
    location,
    sessionStorage: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
    },
  });
}

describe("inspectWebAuthnPage loopback", () => {
  let replace: ReturnType<typeof vi.fn>;
  let storage: Record<string, string>;

  beforeEach(() => {
    replace = vi.fn();
    storage = {};
    installWindow({
      hostname: "127.0.0.1",
      origin: "http://127.0.0.1:9470",
      href: "http://127.0.0.1:9470/",
      protocol: "http:",
      port: "9470",
      replace,
    }, storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns redirecting for 127.0.0.1 when expected origin is localhost", () => {
    const result = inspectWebAuthnPage({
      expectedOrigin: "http://localhost:9470",
      rpId: "localhost",
    });
    expect(result.status).toBe("redirecting");
    expect(replace).toHaveBeenCalledWith("http://localhost:9470/");
  });

  it("does not call replace twice for the same target URL", () => {
    const target = "http://localhost:9470/";
    storage.orgos_webauthn_loopback_redirect = target;

    const result = inspectWebAuthnPage({
      expectedOrigin: "http://localhost:9470",
      rpId: "localhost",
    });

    expect(result.status).toBe("redirecting");
    expect(replace).not.toHaveBeenCalled();
  });

  it("returns ok on localhost without redirect", () => {
    installWindow({
      hostname: "localhost",
      origin: "http://localhost:9470",
      href: "http://localhost:9470/",
      protocol: "http:",
      port: "9470",
      replace,
    }, storage);

    const result = inspectWebAuthnPage({
      expectedOrigin: "http://localhost:9470",
      rpId: "localhost",
    });

    expect(result).toEqual({ status: "ok" });
    expect(replace).not.toHaveBeenCalled();
  });
});
