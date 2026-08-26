import { afterEach, describe, expect, it, vi } from "vitest";

describe("passkey ceremony client wiring", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("completeSettlementPasskey always requests hybrid hints", async () => {
    const getPasskey = vi.fn(async () => ({
      rawId: "cred-id",
      response: {
        clientDataJSON: "e30",
        authenticatorData: "e30",
        signature: "e30",
      },
    }));
    vi.doMock("../apps/shared/webauthn-simple.js", () => ({
      browserSupportsWebAuthn: () => true,
      getPasskeyWithSimpleWebAuthn: getPasskey,
    }));
    vi.doMock("../apps/shared/webauthn-page-origin.js", () => ({
      assertWebAuthnRpHost: () => undefined,
    }));

    const { completeSettlementPasskey } = await import(
      "../apps/shared/complete-settlement-passkey.js"
    );
    await completeSettlementPasskey(
      async () => ({ ok: true }),
      {
        challenge_id: "c1",
        token: "t1",
        webauthn_challenge: "chal",
        rp_id: "localhost",
        allow_credentials: [
          { id: "cred-id", type: "public-key", transports: ["hybrid", "internal", "usb"] },
        ],
      }
    );

    expect(getPasskey).toHaveBeenCalledWith(
      expect.objectContaining({
        hints: ["hybrid"],
        allow_credentials: [{ id: "cred-id", type: "public-key", transports: ["hybrid", "internal"] }],
      })
    );
  });
});
