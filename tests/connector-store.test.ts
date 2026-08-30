import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import {
  connectorTokenPath,
  connectorsFilePath,
  deleteConnectorToken,
  isConnectorTokenExpired,
  loadConnectorSettings,
  loadConnectorToken,
  readConnectorStatus,
  saveConnectorSettings,
  saveConnectorToken,
} from "../src/lib/integrations/connector-store.js";
import {
  buildConnectorSecretsSnapshot,
  connectorSecretsFilePath,
  resetConnectorSecretsHydrationForTest,
  saveConnectorSecrets,
} from "../src/lib/integrations/connector-secrets-store.js";

/**
 * The store is the only place a connector credential lives, so the tests check
 * the two promises the rest of the system relies on: a token round-trips, and
 * nothing that leaves the module carries a secret value.
 */
describe("connector store", () => {
  const env = { ...process.env };

  beforeEach(() => {
    setTenantId("demo");
    resetConnectorSecretsHydrationForTest();
    delete process.env.ORGOS_SLACK_WEBHOOK_URL;
    delete process.env.ORGOS_ASANA_PAT;
  });

  afterEach(() => {
    for (const path of [
      connectorTokenPath("slack"),
      connectorTokenPath("asana"),
      connectorsFilePath(),
      connectorSecretsFilePath(),
    ]) {
      if (existsSync(path)) rmSync(path);
    }
    process.env = { ...env };
    resetConnectorSecretsHydrationForTest();
  });

  it("round-trips a token and removes it on disconnect", () => {
    saveConnectorToken({
      version: 1,
      provider: "slack",
      access_token: "xoxb-secret",
      token_type: "Bearer",
      connected_via: "community",
      account_label: "Acme HQ",
    });

    expect(loadConnectorToken("slack")?.account_label).toBe("Acme HQ");
    expect(deleteConnectorToken("slack")).toBe(true);
    expect(loadConnectorToken("slack")).toBeNull();
  });

  it("keeps the access token out of the status snapshot", () => {
    saveConnectorToken({
      version: 1,
      provider: "slack",
      access_token: "xoxb-secret",
      token_type: "Bearer",
      connected_via: "community",
      account_label: "Acme HQ",
    });

    const status = readConnectorStatus("slack");
    expect(status.connected).toBe(true);
    expect(JSON.stringify(status)).not.toContain("xoxb-secret");
  });

  it("stores routing settings per provider", () => {
    saveConnectorSettings("asana", { default_project_gid: "12345" }, "OP-001");
    expect(loadConnectorSettings("asana")?.default_project_gid).toBe("12345");
    expect(loadConnectorSettings("slack")).toBeUndefined();
  });

  it("treats slack bot tokens as non-expiring", () => {
    const expired = { expiry_date: Date.now() - 60_000 };
    expect(
      isConnectorTokenExpired({
        version: 1,
        provider: "slack",
        access_token: "x",
        token_type: "Bearer",
        connected_via: "community",
        ...expired,
      }),
    ).toBe(false);
    expect(
      isConnectorTokenExpired({
        version: 1,
        provider: "gdrive",
        access_token: "x",
        token_type: "Bearer",
        connected_via: "community",
        ...expired,
      }),
    ).toBe(true);
  });

  it("reports fallback secrets as masked hints only", () => {
    saveConnectorSecrets({
      ORGOS_SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/TOP/SECRET/VALUE",
      ORGOS_ASANA_PAT: "1/1234567890:abcdefghijklmnop",
    });
    const snapshot = buildConnectorSecretsSnapshot();
    expect(snapshot.slack_webhook_configured).toBe(true);
    expect(snapshot.asana_pat_configured).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("SECRET/VALUE");
    expect(JSON.stringify(snapshot)).not.toContain("abcdefghijklmnop");
  });
});
