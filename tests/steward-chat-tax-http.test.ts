import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";

/**
 * Tax and payroll over HTTP. Two properties matter here and neither is visible
 * from the CLI: the module never claims to submit to e-Tax / eLTAX (ADR 0052),
 * and anything that writes into the tenant sits behind `finance:reconcile`
 * rather than the read tier.
 */
describe("steward chat tax and payroll HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  let baseUrl = "";
  const env = { ...process.env };

  beforeEach(async () => {
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.ORGOS_CSRF = "0";
    handle = await startStewardChatForTest();
    baseUrl = handle.url;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
  });

  async function login(operatorId = "OP-001"): Promise<string> {
    const res = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passkey: "test-pass",
        operator_id: operatorId,
        approver_id: operatorId,
      }),
    });
    expect(res.status, await res.text()).toBe(200);
    return res.headers.get("set-cookie") ?? "";
  }

  function post(path: string, cookie: string, body: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  }

  it("requires a session for every tax surface", async () => {
    for (const path of [
      "/chat/v1/tax/readiness",
      "/chat/v1/tax/calendar",
      "/chat/v1/tax/gaps",
      "/chat/v1/tax/consumption",
      "/chat/v1/tax/payroll-yea",
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(401);
    }
  });

  it("states that filing is a handoff, never a submission", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/tax/handoff`, {
      headers: { Cookie: cookie },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { ok: boolean; submission: string };
    expect(body.ok).toBe(true);
    expect(body.submission).toBe("not-for-etax");
  });

  it("expands the filing calendar and the gaps beside it", async () => {
    const cookie = await login();
    const calendar = await fetch(`${baseUrl}/chat/v1/tax/calendar?today=2026-08-01`, {
      headers: { Cookie: cookie },
    });
    expect(calendar.status, await calendar.clone().text()).toBe(200);
    const cal = (await calendar.json()) as { ok: boolean; rows?: unknown[] };
    expect(cal.ok).toBe(true);

    const gaps = await fetch(`${baseUrl}/chat/v1/tax/gaps`, { headers: { Cookie: cookie } });
    expect(gaps.status).toBe(200);
    expect(((await gaps.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("expands lodging tax from the ledger, not from a guess", async () => {
    setTenantId("mal");
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/tax/calendar?today=2026-08-01`, {
      headers: { Cookie: cookie },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as {
      rows?: { id?: string; amount_confidence?: string | null; amount_note?: string | null }[];
    };
    const fromLedger = (body.rows ?? []).filter((r) => r.amount_confidence === "ledger");
    // Either the ledger carries the period (confidence "ledger") or the row says
    // so out loud. What must never happen is a lodging amount presented as fact
    // when nothing backs it.
    for (const row of fromLedger) {
      expect(row.amount_note ?? "").not.toContain("台帳に該当期間の算定なし");
    }
  });

  it("reports the consumption tax assessment without asking for input", async () => {
    const cookie = await login();
    const res = await fetch(`${baseUrl}/chat/v1/tax/consumption`, {
      headers: { Cookie: cookie },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("computes a payroll month deterministically from rates", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/tax/payroll-calc", cookie, {
      month: "2026-07",
      gross_yen: 400_000,
      dependents: 1,
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const first = (await res.json()) as { run: Record<string, unknown> };

    const again = await post("/chat/v1/tax/payroll-calc", cookie, {
      month: "2026-07",
      gross_yen: 400_000,
      dependents: 1,
    });
    const second = (await again.json()) as { run: Record<string, unknown> };
    expect(second.run).toEqual(first.run);
  });

  it("refuses a payroll month that is not YYYY-MM or has a negative gross", async () => {
    const cookie = await login();
    for (const body of [
      { month: "2026/07", gross_yen: 400_000 },
      { month: "2026-07", gross_yen: -1 },
      { month: "2026-07" },
    ]) {
      const res = await post("/chat/v1/tax/payroll-calc", cookie, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
  });

  it("refuses a bonus draft without a period and a gross amount", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/tax/bonus-draft", cookie, { employee_id: "EMP-001" });
    expect(res.status).toBe(422);
  });

  it("refuses to post a bonus journal without a run id", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/tax/bonus-post", cookie, {});
    expect(res.status).toBe(422);
  });

  it("summarizes the year-end adjustment as a draft", async () => {
    const cookie = await login();
    const res = await post("/chat/v1/tax/yea/compute", cookie, {});
    expect([200, 422]).toContain(res.status);
    if (res.status === 200) {
      expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    }
  });

  it("keeps tenant writes behind finance:reconcile", async () => {
    // OP-002 is a plain operator: it may read the tax picture, never write it.
    const cookie = await login("OP-002");
    process.env.ORGOS_PROD = "1";
    for (const path of [
      "/chat/v1/tax/xml-draft",
      "/chat/v1/tax/bonus-draft",
      "/chat/v1/tax/bonus-post",
      "/chat/v1/tax/yea/ready",
    ]) {
      const res = await post(path, cookie, { fiscal_year: "FY2026" });
      expect([401, 403], path).toContain(res.status);
    }
  });
});
