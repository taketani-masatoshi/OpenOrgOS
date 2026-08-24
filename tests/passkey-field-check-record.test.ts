import { describe, expect, it } from "vitest";
import { deriveFieldChecklistResults } from "../src/lib/wire-console/auth/passkey-field-check-record.js";
import type { PasskeyFieldCheckResult } from "../src/lib/wire-console/auth/passkey-field-check.js";

function sampleResult(overrides?: Partial<PasskeyFieldCheckResult>): PasskeyFieldCheckResult {
  return {
    url: "https://operator.oorgos.org",
    ok: true,
    rows: [
      { id: "health", ok: true, detail: "ok" },
      { id: "auth_config", ok: true, detail: "ok" },
      { id: "webauthn_origin_match", ok: true, detail: "ok" },
      { id: "credential_file_mode", ok: true, detail: "mode 0600" },
      { id: "doctor_wire_console_auth_prod", ok: true, detail: "ok" },
    ],
    ...overrides,
  };
}

describe("passkey field-check record", () => {
  it("derives automated checklist rows", () => {
    const { checklist, host } = deriveFieldChecklistResults(sampleResult());
    expect(host).toBe("operator.oorgos.org");
    expect(checklist[1]).toBe("Pass");
    expect(checklist[4]).toBe("Pass");
    expect(checklist[5]).toBe("Pass");
    expect(checklist[2]).toBe("要手動");
    expect(checklist[3]).toBe("要手動");
  });

  it("marks origin fail when webauthn_origin_match fails", () => {
    const result = sampleResult({
      ok: false,
      rows: [
        { id: "health", ok: true, detail: "ok" },
        { id: "auth_config", ok: true, detail: "ok" },
        { id: "webauthn_origin_match", ok: false, detail: "mismatch" },
        { id: "credential_file_mode", ok: true, detail: "ok" },
        { id: "doctor_wire_console_auth_prod", ok: true, detail: "ok" },
      ],
    });
    expect(deriveFieldChecklistResults(result).checklist[1]).toBe("Fail");
  });
});
