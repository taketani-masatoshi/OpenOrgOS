import { describe, expect, it } from "vitest";
import { webauthnOriginsEqual } from "../src/lib/wire-console/auth/webauthn-origin.js";

describe("webauthnOriginsEqual", () => {
  it("treats 127.0.0.1 and localhost as the same loopback origin when port matches", () => {
    expect(
      webauthnOriginsEqual("http://localhost:9470", "http://127.0.0.1:9470")
    ).toBe(true);
    expect(
      webauthnOriginsEqual("http://127.0.0.1:9470", "http://localhost:9470")
    ).toBe(true);
  });

  it("rejects a different port", () => {
    expect(
      webauthnOriginsEqual("http://localhost:9471", "http://127.0.0.1:9470")
    ).toBe(false);
  });
});
