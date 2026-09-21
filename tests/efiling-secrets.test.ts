import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCertifiedCommand,
  buildFilingChildEnv,
} from "../src/lib/efiling/certified-adapter.js";
import { redactFilingRecord } from "../src/lib/efiling/redact.js";

describe("efiling secrets", () => {
  it("rejects secret child env names without echoing the value", () => {
    expect(() => buildFilingChildEnv({}, { USER_PIN: "super-secret-value" })).toThrow(/USER_PIN/);
    try {
      buildFilingChildEnv({}, { USER_PIN: "super-secret-value" });
    } catch (error) {
      expect(String(error)).not.toContain("super-secret-value");
    }
  });

  it("drops loader and node option overrides", () => {
    const env = buildFilingChildEnv(
      { PATH: "/usr/bin", LD_PRELOAD: "/tmp/x", NODE_OPTIONS: "--inspect" },
      { FOO: "bar" }
    );
    expect(env.LD_PRELOAD).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.FOO).toBe("bar");
  });

  it("rejects an executable whose SHA-256 does not match the pin", () => {
    const path = join(tmpdir(), `efiling-pin-${process.pid}.txt`);
    writeFileSync(path, "not-the-hash");
    expect(() =>
      assertCertifiedCommand({
        executable: path,
        executableSha256: "deadbeef",
        evidencePath: path,
        evidenceSha256: "deadbeef",
      })
    ).toThrow(/SHA-256/);
  });

  it("redacts private keys and PIN fields in audit records", () => {
    const redacted = redactFilingRecord({
      pin: "1234",
      note: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    });
    expect(JSON.stringify(redacted)).not.toContain("1234");
    expect(JSON.stringify(redacted)).not.toContain("BEGIN PRIVATE KEY");
  });
});
