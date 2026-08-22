import { describe, expect, it } from "vitest";
import {
  validateDeployUrlMatchesWebAuthn,
  validateWebAuthnProdEnv,
  webAuthnOriginHost,
} from "../src/lib/console-auth/settlement-passkey-prod.js";

describe("settlement passkey production readiness", () => {
  it("requires HTTPS origin for public host env", () => {
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "operator.example.com";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://operator.example.com";
    const rows = validateWebAuthnProdEnv({
      host: "operator.example.com",
      wireAuthProd: true,
    });
    const httpsRow = rows.find((r) => r.detail.includes("https://"));
    expect(httpsRow?.ok).toBe(false);
    delete process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
  });

  it("accepts local localhost single RP", () => {
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9470";
    const rows = validateWebAuthnProdEnv({ host: "127.0.0.1", wireAuthProd: true });
    expect(rows.every((r) => r.ok)).toBe(true);
    delete process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
  });

  it("rejects 127.0.0.1 as rp_id on local deploy", () => {
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "127.0.0.1";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9470";
    const rows = validateWebAuthnProdEnv({ host: "127.0.0.1", wireAuthProd: true });
    const rpRow = rows.find((r) => r.detail.includes("WIRE_CONSOLE_WEBAUTHN_RP_ID"));
    expect(rpRow?.ok).toBe(false);
    delete process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN;
  });

  it("matches deploy URL to public webauthn config", () => {
    const failures = validateDeployUrlMatchesWebAuthn("https://operator.example.com", {
      rp_id: "operator.example.com",
      origin: "https://operator.example.com",
      settlement_count: 1,
    });
    expect(failures).toEqual([]);
  });

  it("rejects rp_id / origin mismatch on HTTPS", () => {
    const failures = validateDeployUrlMatchesWebAuthn("https://operator.example.com", {
      rp_id: "wrong.example.com",
      origin: "https://operator.example.com",
    });
    expect(failures.some((f) => f.includes("hostname"))).toBe(true);
  });

  it("parses origin host with port", () => {
    expect(webAuthnOriginHost("http://localhost:9470")).toBe("localhost:9470");
  });
});
