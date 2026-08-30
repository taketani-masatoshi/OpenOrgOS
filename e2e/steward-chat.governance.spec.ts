import { expect, test } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";
import { loginApi } from "./helpers/api-login";

/**
 * Governance and legal surfaces on the running console: internal approvals,
 * company events and their hash chain, org chart change proposals, company
 * identity setup, and the contract ledger. Every write here is a decision a
 * human is accountable for, so the checks are about refusals.
 */
test.describe("steward chat governance", () => {
  test("approvals queue opens for an operator", async ({ page }) => {
    await loginConsole(page);
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("proposing an approval requires a subject type", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/approvals/propose", {
      data: { message: "no subject" },
    });
    expect(res.status()).toBe(422);
  });

  test("a proposed approval appears in the queue", async ({ request }) => {
    await loginApi(request);
    const proposed = await request.post("/chat/v1/approvals/propose", {
      data: { subject_type: "expense", message: "E2E governance", amount: 9_000 },
    });
    expect(proposed.status(), await proposed.text()).toBe(200);
    const { approval } = (await proposed.json()) as { approval: { approval_id: string } };

    const list = await request.get("/chat/v1/approvals");
    expect(list.status()).toBe(200);
    expect(await list.text()).toContain(approval.approval_id);
  });

  test("deciding an approval that does not exist is refused", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/approvals/APR-does-not-exist/approve", {
      data: {},
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("the company event chain verifies", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/events/chain/verify");
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { ok: boolean; report: unknown };
    expect(body.ok).toBe(true);
    expect(body.report).toBeDefined();
  });

  test("an org chart change cannot be applied without a proposal", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/org/chart/change/apply", { data: {} });
    expect(res.status()).toBe(422);
  });

  test("org chart is readable", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/org/chart");
    expect(res.status(), await res.text()).toBe(200);
  });

  test("company identity setup is reachable and validated", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/product/onboarding/setup", {
      data: { fiscal_year_end_month: 99 },
    });
    // Month 99 does not exist; accepting it would write a company identity that
    // no calendar can satisfy.
    expect(res.status(), await res.text()).toBe(422);
  });

  test("a command plan is never executed by previewing it", async ({ request }) => {
    await loginApi(request);
    const catalog = await request.get("/chat/v1/commands");
    expect(catalog.status(), await catalog.text()).toBe(200);

    const preview = await request.post("/chat/v1/commands/preview", {
      data: { message: "今日の状況を教えて" },
    });
    expect(preview.status()).toBe(200);
    const { plan } = (await preview.json()) as {
      plan: { status: string; executed?: boolean };
    };
    expect(plan.executed ?? false).toBe(false);

    const stale = await request.post("/chat/v1/commands/PLAN-does-not-exist/run", {
      data: { confirmed: true },
    });
    expect(stale.status()).toBe(404);
  });

  test("contract ledger status needs a session", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const res = await anonymous.get("/chat/v1/contracts/status");
    expect(res.status()).toBe(401);
    await anonymous.dispose();
  });

  test("contract ledger status is readable with a session", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/contracts/status");
    expect(res.status(), await res.text()).toBe(200);
  });

  test("medical device ledgers are readable and never writable over HTTP", async ({ request }) => {
    await loginApi(request);
    const read = await request.get("/chat/v1/compliance/medical-device");
    expect(read.status(), await read.text()).toBe(200);
    const body = (await read.json()) as { ok: boolean; enabled: boolean };
    expect(body.ok).toBe(true);

    const write = await request.post("/chat/v1/compliance/medical-device", {
      data: { id: "CAPA-001", status: "closed" },
    });
    expect(write.status()).toBe(405);
  });
});
