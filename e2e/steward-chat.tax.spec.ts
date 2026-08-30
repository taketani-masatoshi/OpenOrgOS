import { expect, test } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";
import { loginApi } from "./helpers/api-login";

/**
 * Tax and payroll on the running console. The module prepares a handoff for a
 * tax professional; it never files. These tests hold that line, and check that
 * the deterministic calculations stay deterministic.
 */
test.describe("steward chat tax and payroll", () => {
  test("tax handoff page opens for an operator", async ({ page }) => {
    await loginConsole(page);
    const res = await page.goto("/?tax=1");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("the handoff never claims to submit to e-Tax", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/tax/handoff");
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { submission: string };
    expect(body.submission).toBe("not-for-etax");
  });

  test("the filing calendar and its gaps are readable", async ({ request }) => {
    await loginApi(request);
    const calendar = await request.get("/chat/v1/tax/calendar?today=2026-08-01");
    expect(calendar.status(), await calendar.text()).toBe(200);
    const gaps = await request.get("/chat/v1/tax/gaps");
    expect(gaps.status()).toBe(200);
  });

  test("payroll for the same month and gross gives the same numbers", async ({ request }) => {
    await loginApi(request);
    const body = { month: "2026-07", gross_yen: 400000, dependents: 1 };
    const first = await request.post("/chat/v1/tax/payroll-calc", { data: body });
    expect(first.status(), await first.text()).toBe(200);
    const second = await request.post("/chat/v1/tax/payroll-calc", { data: body });
    expect(await second.json()).toEqual(await first.json());
  });

  test("a malformed payroll month is refused", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/tax/payroll-calc", {
      data: { month: "July 2026", gross_yen: 400000 },
    });
    expect(res.status()).toBe(422);
  });

  test("consumption tax assessment is readable", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/tax/consumption");
    expect(res.status(), await res.text()).toBe(200);
  });

  test("year-end readiness is readable and a bonus draft needs its inputs", async ({ request }) => {
    await loginApi(request);
    const readiness = await request.get("/chat/v1/tax/payroll-yea");
    expect(readiness.status(), await readiness.text()).toBe(200);

    const draft = await request.post("/chat/v1/tax/bonus-draft", {
      data: { employee_id: "EMP-001" },
    });
    expect(draft.status()).toBe(422);
  });

  test("a tax accountant guest link is worthless without its token", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const noToken = await anonymous.get("/chat/v1/product/guest-setup");
    expect(noToken.status()).toBe(422);
    const badToken = await anonymous.get("/chat/v1/product/guest-setup?token=forged");
    expect(badToken.status()).toBe(403);
    await anonymous.dispose();
  });

  test("inviting a guest seat needs a name and an address", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/product/admin/operators", {
      data: { role: "readonly", guest_expires_at: "2027-03-31" },
    });
    expect(res.status()).toBe(422);
  });

  test("tax surfaces need a session", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    for (const path of ["/chat/v1/tax/readiness", "/chat/v1/tax/calendar", "/chat/v1/tax/gaps"]) {
      const res = await anonymous.get(path);
      expect(res.status(), path).toBe(401);
    }
    await anonymous.dispose();
  });
});
