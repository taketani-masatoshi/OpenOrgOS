import { describe, expect, it } from "vitest";
import { WebAuthnRedirectInProgressError } from "../apps/shared/webauthn-page-origin.js";
import { webauthnUserMessage } from "../apps/shared/webauthn-user-error.js";

describe("webauthnUserMessage", () => {
  it("maps redirect-in-progress to short copy", () => {
    expect(webauthnUserMessage(new WebAuthnRedirectInProgressError())).toBe(
      "正しい URL に移動しています…",
    );
  });

  it("uses login-specific copy for NotAllowedError when purpose is login", () => {
    const err = new DOMException("The operation was cancelled.", "NotAllowedError");
    expect(webauthnUserMessage(err, { purpose: "login" })).toBe(
      "Touch ID をキャンセルしました。もう一度お試しください",
    );
  });

  it("keeps settlement / hybrid hint for NotAllowedError without login purpose", () => {
    const err = new DOMException("The operation was cancelled.", "NotAllowedError");
    expect(webauthnUserMessage(err, { purpose: "settlement" })).toBe(
      "キャンセルしました。もう一度試すときは Bluetooth をオンにしてください",
    );
  });

  it("maps bootstrap token required", () => {
    expect(webauthnUserMessage(new Error("bootstrap token required"))).toMatch(/bootstrap トークン/);
  });

  it("maps bootstrap token invalid or used", () => {
    expect(webauthnUserMessage(new Error("already used"))).toMatch(/無効/);
  });

  it("maps origin mismatch with localhost hint", () => {
    expect(
      webauthnUserMessage(new Error("webauthn origin mismatch"), {
        expectedOrigin: "http://localhost:9470",
      }),
    ).toMatch(/localhost/);
  });
});
