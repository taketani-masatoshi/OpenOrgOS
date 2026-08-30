import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../src/lib/utils.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  buildConnectorConnectUrl,
  claimConnectorBind,
  createConnectorBind,
  verifyConnectorBind,
} from "../src/lib/protocol/community-connector-bind.js";
import {
  handleConnectorBindCreate,
  handleConnectorTokenPush,
} from "../src/lib/protocol/community-connectors-api.js";
import {
  connectorTokenPath,
  deleteConnectorToken,
  loadConnectorToken,
} from "../src/lib/integrations/connector-store.js";

/**
 * A bind nonce is what stops the governance token alone from writing a
 * credential into an arbitrary tenant, so single use and expiry are the
 * behaviours worth pinning down.
 */
describe("community connector bind", () => {
  const registryPath = () => join(getDataDir(), "protocol", "community-connector-bind.yaml");

  beforeEach(() => {
    setTenantId("demo");
  });

  afterEach(() => {
    for (const path of [registryPath(), connectorTokenPath("slack")]) {
      if (existsSync(path)) rmSync(path);
    }
  });

  it("verifies a fresh bind and refuses it after it is claimed", () => {
    const bind = createConnectorBind("slack", "demo");
    expect(verifyConnectorBind("slack", "demo", bind.nonce).ok).toBe(true);

    expect(claimConnectorBind("slack", "demo", bind.nonce).ok).toBe(true);
    const second = claimConnectorBind("slack", "demo", bind.nonce);
    expect(second.ok).toBe(false);
  });

  it("does not accept a nonce issued for another provider or tenant", () => {
    const bind = createConnectorBind("slack", "demo");
    expect(verifyConnectorBind("asana", "demo", bind.nonce).ok).toBe(false);
    expect(verifyConnectorBind("slack", "other-tenant", bind.nonce).ok).toBe(false);
  });

  it("rejects an expired bind", () => {
    const bind = createConnectorBind("slack", "demo", { ttlMinutes: 1 });
    const past = Date.now() + 2 * 60_000;
    const original = Date.now;
    Date.now = () => past;
    try {
      expect(verifyConnectorBind("slack", "demo", bind.nonce).ok).toBe(false);
    } finally {
      Date.now = original;
    }
  });

  it("builds a Community connect URL carrying provider, tenant and nonce", () => {
    const url = new URL(buildConnectorConnectUrl("asana", "demo", "abc123"));
    expect(url.searchParams.get("connector")).toBe("asana");
    expect(url.searchParams.get("tenant_id")).toBe("demo");
    expect(url.searchParams.get("nonce")).toBe("abc123");
  });

  it("refuses unauthorized bind creation and token push", () => {
    expect(handleConnectorBindCreate({ provider: "slack", tenant_id: "demo" }, false).status).toBe(
      401,
    );
    expect(
      handleConnectorTokenPush(
        { provider: "slack", tenant_id: "demo", nonce: "x", token: { access_token: "y" } },
        false,
      ).status,
    ).toBe(401);
  });

  it("stores a pushed token only when the bind matches", () => {
    const created = handleConnectorBindCreate({ provider: "slack", tenant_id: "demo" }, true);
    const nonce = created.nonce as string;

    const wrongNonce = handleConnectorTokenPush(
      { provider: "slack", tenant_id: "demo", nonce: "bogus", token: { access_token: "x" } },
      true,
    );
    expect(wrongNonce.ok).toBe(false);
    expect(loadConnectorToken("slack")).toBeNull();

    const pushed = handleConnectorTokenPush(
      {
        provider: "slack",
        tenant_id: "demo",
        nonce,
        token: { access_token: "xoxb-1", account_label: "Acme HQ" },
      },
      true,
    );
    expect(pushed.ok).toBe(true);
    expect(loadConnectorToken("slack")?.account_label).toBe("Acme HQ");
    deleteConnectorToken("slack");
  });

  it("keeps Gmail on the tenant-mail route so mail-config is not skipped", () => {
    const result = handleConnectorTokenPush(
      { provider: "gmail", tenant_id: "demo", nonce: "x", token: { access_token: "y" } },
      true,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("tenant-mail");
  });
});
