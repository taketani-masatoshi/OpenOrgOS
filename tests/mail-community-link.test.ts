import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  buildCommunityMailConnectUrl,
  communityConnectionsUrl,
  createCommunityGmailBind,
  getCommunityUrl,
  verifyCommunityGmailBind,
} from "../src/lib/protocol/community-gmail-bind.js";

describe("mail setup gmail --community-link helpers", () => {
  beforeEach(() => {
    setTenantId("demo");
    const protocolDir = join(getDataDir(), "protocol");
    if (existsSync(protocolDir)) rmSync(protocolDir, { recursive: true, force: true });
    mkdirSync(protocolDir, { recursive: true });
    delete process.env.ORGOS_STEWARD_PROTOCOL_URL;
  });

  afterEach(() => {
    delete process.env.ORGOS_COMMUNITY_URL;
  });

  it("builds Community connect URL with orgos_mail query params", () => {
    const entry = createCommunityGmailBind("mal", 30, {
      issuedForEmails: ["ceo@example.com"],
    });
    const url = buildCommunityMailConnectUrl(
      entry.tenant_id,
      entry.nonce,
      "https://community.example.org"
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/settings/connections");
    expect(parsed.searchParams.get("orgos_mail")).toBe("1");
    expect(parsed.searchParams.get("tenant_id")).toBe("mal");
    expect(parsed.searchParams.get("nonce")).toBe(entry.nonce);
  });

  it("defaults Connections URL to community.oorgos.org", () => {
    delete process.env.ORGOS_COMMUNITY_URL;
    expect(communityConnectionsUrl()).toBe(
      "https://community.oorgos.org/settings/connections",
    );
    expect(getCommunityUrl()).toBe("https://community.oorgos.org");
  });

  it("create then verify bind nonce (community-link dry-run)", () => {
    const entry = createCommunityGmailBind("demo");
    const verified = verifyCommunityGmailBind("demo", entry.nonce);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.entry.tenant_id).toBe("demo");
      expect(verified.entry.nonce).toBe(entry.nonce);
    }
  });
});
