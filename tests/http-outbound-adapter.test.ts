/**
 * Direct HTTP outbound — L1 payload, dry-run, auth, odata_v2 reject.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import {
  assertL1Payload,
  buildMonthlyFinancePayload,
  exportHttpOutbound,
  httpOutboundStatus,
  saveHttpOutboundConfig,
} from "../src/lib/integrations/http-outbound-adapter.js";
import {
  resetHttpOutboundSecretsHydrationForTest,
  saveHttpOutboundSecrets,
  httpOutboundSecretsFilePath,
} from "../src/lib/integrations/http-outbound-secrets.js";

function cleanup(): void {
  for (const name of ["http-outbound.yaml", "http-exports.yaml"]) {
    const p = join(getDataDir(), "integrations", name);
    if (existsSync(p)) rmSync(p, { force: true });
  }
  const monthly = join(getDataDir(), "finance", "monthly", "2026-05.yaml");
  if (existsSync(monthly)) rmSync(monthly, { force: true });
  const secrets = httpOutboundSecretsFilePath();
  if (existsSync(secrets)) rmSync(secrets, { force: true });
  resetHttpOutboundSecretsHydrationForTest();
  delete process.env.ORGOS_HTTP_OUTBOUND_BEARER;
  delete process.env.ORGOS_HTTP_OUTBOUND_CLIENT_ID;
  delete process.env.ORGOS_HTTP_OUTBOUND_CLIENT_SECRET;
}

describe("http-outbound adapter", () => {
  beforeEach(() => {
    setTenantId("demo");
    cleanup();
    mkdirSync(join(getDataDir(), "finance", "monthly"), { recursive: true });
    writeFileSync(
      join(getDataDir(), "finance", "monthly", "2026-05.yaml"),
      `month: "2026-05"
basis: actual
revenue:
  - property_id: PROP-001
    category: rent
    amount: 100000
expenses:
  - category: other
    amount: 1000
    chart_account_code: "5300"
`,
      "utf-8",
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("rejects L2 keys in payloads", () => {
    expect(() => assertL1Payload({ account_number: "123" })).toThrow(/L2 field/);
    expect(() => assertL1Payload({ nested: { bank_account: "x" } })).toThrow(/L2 field/);
  });

  it("builds monthly L1 payload without notes or secrets", () => {
    const built = buildMonthlyFinancePayload("2026-05");
    expect(built.source).toBe("finance.monthly");
    expect(built.payload.month).toBe("2026-05");
    expect(JSON.stringify(built.payload)).not.toContain("account_number");
  });

  it("dry-run skips fetch and records ledger", async () => {
    saveHttpOutboundConfig({
      enabled: true,
      base_url: "https://erp.example.com",
      auth_kind: "none",
      dialect: "rest",
      routes: [
        {
          id: "monthly",
          source: "finance.monthly",
          method: "POST",
          path: "/api/monthly/{month}",
        },
      ],
    });
    let fetched = false;
    const result = await exportHttpOutbound({
      kind: "monthly",
      id: "2026-05",
      dryRun: true,
      fetchImpl: (async () => {
        fetched = true;
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(fetched).toBe(false);
    expect(result.url).toContain("/api/monthly/2026-05");
  });

  it("rejects odata_v2", async () => {
    expect(() =>
      saveHttpOutboundConfig({
        enabled: true,
        base_url: "https://erp.example.com",
        dialect: "odata_v2",
      }),
    ).toThrow(/odata_v2/);
  });

  it("posts with bearer auth when not dry-run", async () => {
    saveHttpOutboundConfig({
      enabled: true,
      base_url: "https://erp.example.com",
      auth_kind: "bearer",
      dialect: "odata_v4",
      odata_service_path: "/odata/v4/Finance",
      routes: [
        {
          id: "monthly",
          source: "finance.monthly",
          method: "POST",
          path: "/Monthly('{month}')",
        },
      ],
    });
    saveHttpOutboundSecrets({ ORGOS_HTTP_OUTBOUND_BEARER: "tok-secret" });
    expect(existsSync(httpOutboundSecretsFilePath())).toBe(true);

    const calls: Array<{ url: string; auth?: string }> = [];
    const result = await exportHttpOutbound({
      kind: "monthly",
      id: "2026-05",
      dryRun: false,
      fetchImpl: (async (url, init) => {
        const headers = init?.headers as Record<string, string>;
        calls.push({ url: String(url), auth: headers?.Authorization });
        return new Response("{}", { status: 201 });
      }) as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/odata/v4/Finance/Monthly(");
    expect(calls[0]!.auth).toBe("Bearer tok-secret");
  });

  it("status reports missing credentials", () => {
    saveHttpOutboundConfig({
      enabled: true,
      base_url: "https://erp.example.com",
      auth_kind: "bearer",
      routes: [
        {
          id: "monthly",
          source: "finance.monthly",
          method: "POST",
          path: "/x",
        },
      ],
    });
    const status = httpOutboundStatus();
    expect(status.usable).toBe(false);
    expect(status.detail).toMatch(/credentials missing/);
  });

  it("oauth2 client_credentials fetches token then posts", async () => {
    saveHttpOutboundConfig({
      enabled: true,
      base_url: "https://erp.example.com",
      auth_kind: "oauth2_client_credentials",
      token_url: "https://idp.example.com/token",
      dialect: "rest",
      routes: [
        {
          id: "monthly",
          source: "finance.monthly",
          method: "POST",
          path: "/api/{month}",
        },
      ],
    });
    saveHttpOutboundSecrets({
      ORGOS_HTTP_OUTBOUND_CLIENT_ID: "cid",
      ORGOS_HTTP_OUTBOUND_CLIENT_SECRET: "csecret",
    });

    const urls: string[] = [];
    const result = await exportHttpOutbound({
      kind: "monthly",
      id: "2026-05",
      fetchImpl: (async (url) => {
        urls.push(String(url));
        if (String(url).includes("/token")) {
          return new Response(JSON.stringify({ access_token: "atok" }), { status: 200 });
        }
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(urls[0]).toContain("/token");
    expect(urls[1]).toContain("/api/2026-05");
  });
});
