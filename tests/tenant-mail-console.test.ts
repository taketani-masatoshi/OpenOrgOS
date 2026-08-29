import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  getExecutiveRecordsDir,
  getMailConfigPath,
} from "../src/lib/correspondence/paths.js";
import { getGmailOAuthTokenPath } from "../src/lib/correspondence/gmail-oauth.js";
import {
  disconnectTenantGmail,
  readTenantMailStatus,
  updateTenantMailBasics,
} from "../src/lib/correspondence/tenant-mail-console.js";

describe("tenant mail console settings", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("_fixture-books");
    mkdirSync(getExecutiveRecordsDir(), { recursive: true });
  });

  afterEach(() => {
    rmSync(getMailConfigPath(), { force: true });
    rmSync(getGmailOAuthTokenPath(), { force: true });
    process.env = { ...env };
  });

  it("writes sender name, address and provider without touching secrets", () => {
    const saved = updateTenantMailBasics({
      from: { name: "サンプル株式会社", email: "secretary@example.com" },
      provider: "smtp",
      smtp: { host: "smtp.test.local", port: 587 },
    });
    expect(saved.from.name).toBe("サンプル株式会社");
    expect(saved.provider).toBe("smtp");
    expect(existsSync(getMailConfigPath())).toBe(true);

    const status = readTenantMailStatus();
    expect(status.from.email).toBe("secretary@example.com");
    expect(status.smtp?.host).toBe("smtp.test.local");
    expect(status.connected).toBe(false);
    expect(Object.keys(status)).not.toContain("access_token");
  });

  it("disconnects Gmail by dropping the token and leaving gmail_api", () => {
    updateTenantMailBasics({
      from: { name: "OrgOS Secretary", email: "secretary@example.com" },
      provider: "gmail_api",
      smtp: { host: "smtp.test.local", port: 587 },
    });
    writeFileSync(
      getGmailOAuthTokenPath(),
      JSON.stringify({
        access_token: "test-access",
        email: "secretary@example.com",
        connected_via: "test",
      }),
      "utf-8",
    );

    const result = disconnectTenantGmail();
    expect(result.removed).toBe(true);
    expect(result.provider).toBe("smtp");
    expect(existsSync(getGmailOAuthTokenPath())).toBe(false);
    expect(readTenantMailStatus().connected).toBe(false);
  });
});
