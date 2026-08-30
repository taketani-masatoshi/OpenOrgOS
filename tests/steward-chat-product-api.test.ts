import { afterEach, describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import {
  registerSession,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("steward chat product api", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  let workspace = "";
  const env = { ...process.env };

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-product-api-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_TENANT = "ledger-api-test";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.ORGOS_CSRF = "0";
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: "ledger-api-test",
      companyName: "API Test KK",
      adminEmail: "ceo@api.example",
      plan: "starter",
    });
    setTenantId("ledger-api-test");
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  async function start() {
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  }

  function cookieFor(operatorId: string) {
    const { token } = registerSession({
      operator_id: operatorId,
      approver_id: operatorId,
      mode: "prod",
    });
    return `${WIRE_CONSOLE_SESSION_COOKIE}=${token}`;
  }

  it("lists plans without session", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/product/plans`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: Array<{ id: string }> };
    expect(body.plans.length).toBe(3);
  });

  it("creates signup checkout without session", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/product/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: "Signup KK",
        admin_email: "signup@example.com",
        plan: "starter",
        tenant_id: "signup-kk",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { checkout_url: string; tenant_id: string };
    expect(body.tenant_id).toBe("signup-kk");
    expect(body.checkout_url).toBeTruthy();
  });

  it("returns subscription for authenticated user", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/product/subscription`, {
      headers: { Cookie: cookieFor("OP-001") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      subscription: { plan: string; status: string } | null;
    };
    expect(body.subscription?.plan).toBe("starter");
  });

  it("returns customer admin snapshot", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/product/admin`, {
      headers: { Cookie: cookieFor("OP-001") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      operators: Array<{ operator_id: string }>;
      usage: { journal_entries: number };
      platform_billing_settings?: boolean;
    };
    expect(body.operators.some((row) => row.operator_id === "OP-001")).toBe(true);
    expect(body.usage.journal_entries).toBeGreaterThanOrEqual(0);
    expect(body.platform_billing_settings).toBe(true);
  });

  it("refuses stripe settings to a session that is not the representative", async () => {
    await start();
    process.env.ORGOS_PROD = "1";
    const res = await fetch(`${baseUrl}/chat/v1/product/stripe-settings`, {
      headers: { Cookie: cookieFor("OP-002") },
    });
    expect([401, 403]).toContain(res.status);
  });

  it("refuses a stripe webhook whose signature does not verify", async () => {
    await start();
    const res = await fetch(`${baseUrl}/chat/v1/product/stripe/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=1,v1=not-a-real-signature",
      },
      body: JSON.stringify({ type: "checkout.session.completed" }),
    });
    expect([400, 401, 403, 422]).toContain(res.status);
  });

  it("saves stripe settings for ceo without echoing secrets", async () => {
    await start();
    const getRes = await fetch(`${baseUrl}/chat/v1/product/stripe-settings`, {
      headers: { Cookie: cookieFor("OP-001") },
    });
    expect(getRes.status).toBe(200);
    const before = (await getRes.json()) as { commercial_ready: boolean };
    expect(before.commercial_ready).toBe(false);

    const putRes = await fetch(`${baseUrl}/chat/v1/product/stripe-settings`, {
      method: "PUT",
      headers: {
        Cookie: cookieFor("OP-001"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        stripe_secret_key: "sk_test_product_api",
        stripe_webhook_secret: "whsec_product_api",
      }),
    });
    expect(putRes.status).toBe(200);
    const saved = (await putRes.json()) as {
      commercial_ready: boolean;
      secret_key_hint: string | null;
    };
    expect(saved.commercial_ready).toBe(true);
    expect(saved.secret_key_hint).toContain("sk_test_");
    expect(JSON.stringify(saved)).not.toContain("sk_test_product_api");
    expect(JSON.stringify(saved)).not.toContain("whsec_product_api");
  });
});
