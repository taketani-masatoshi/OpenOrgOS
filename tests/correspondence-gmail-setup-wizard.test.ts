import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import { getExecutiveRecordsDir, getMailConfigPath } from "../src/lib/correspondence/paths.js";
import { writeGmailApiMailConfig } from "../src/lib/correspondence/gmail-setup-wizard.js";
import YAML from "yaml";

describe("gmail setup wizard", () => {
  beforeEach(() => {
    setTenantId("demo");
    const dir = getExecutiveRecordsDir();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    const dir = getExecutiveRecordsDir();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it("writes gmail_api mail-config", () => {
    writeGmailApiMailConfig({
      fromEmail: "k.lab.masa@gmail.com",
      fromName: "KK Lab",
    });
    const config = YAML.parse(readFileSync(getMailConfigPath(), "utf-8")) as {
      provider: string;
      from: { email: string };
      receive: { sync: string };
    };
    expect(config.provider).toBe("gmail_api");
    expect(config.from.email).toBe("k.lab.masa@gmail.com");
    expect(config.receive.sync).toBe("gmail_api");
  });
});
