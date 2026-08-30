import { expect, test } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";
import { loginApi } from "./helpers/api-login";

/**
 * Sign-in, the shared control plane, the sales pipeline, the stay ledger and
 * the Community mail flags. These are the surfaces a second tenant would reach
 * first, so the checks are mostly about the boundary: no session, no data.
 */
test.describe("steward chat product and sales", () => {
  test("an anonymous caller gets nothing but the public plans", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    // First request of the suite can land while the server is still warming;
    // give it one settle round before asserting on status codes.
    await anonymous.get("/health").catch(() => undefined);
    const plans = await anonymous.get("/chat/v1/product/plans");
    expect(plans.status()).toBe(200);

    for (const path of [
      "/chat/v1/product/control-plane",
      "/chat/v1/product/ops-dashboard",
      "/chat/v1/customers/pipeline",
      "/chat/v1/hospitality/ops-due",
    ]) {
      const res = await anonymous.get(path);
      expect(res.status(), path).toBe(401);
    }
    await anonymous.dispose();
  });

  test("the session names the operator that signed in", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/auth/me");
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { user?: { operator_id?: string } };
    expect(body.user?.operator_id).toBeTruthy();
  });

  test("logging out really ends the session", async ({ request }) => {
    await loginApi(request);
    const out = await request.post("/chat/v1/auth/logout");
    expect(out.status()).toBeLessThan(400);
    const after = await request.get("/chat/v1/today");
    expect(after.status()).toBe(401);
  });

  test("the sales pipeline carries its module gate", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/customers/pipeline");
    // The demo tenant does not install the sales module, so the surface is
    // closed — and it says which gate closed it rather than returning an empty
    // pipeline that reads like "no deals".
    expect(res.status(), await res.text()).toBe(403);
    const body = (await res.json()) as {
      error: string;
      gate: { sales_enabled: boolean; sales_module_installed: boolean };
    };
    expect(body.error).toBe("customers_tab_unavailable");
    expect(body.gate.sales_module_installed).toBe(false);
  });

  test("a stage move for a deal that does not exist is refused", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/customers/deals/set-stage", {
      data: { deal_id: "DEAL-nope", stage: "qualified" },
    });
    // With the module closed the write is refused before the deal is ever
    // looked up: the gate is the outer wall, not the record check.
    expect(res.status(), await res.text()).toBe(403);
  });

  test("the stay ledger reports zero rather than pretending", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/hospitality/ops-due?today=2026-08-01");
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as {
      module_enabled: boolean;
      stay_count: number;
      due: unknown[];
    };
    // A disabled module must report an empty ledger rather than omitting the
    // counts, so the reader can tell "nothing due" from "not asked".
    expect(body.module_enabled).toBe(false);
    expect(body.stay_count).toBe(0);
    expect(body.due).toEqual([]);
  });

  test("a mail flag is described as a declaration, not a deploy", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/platform/integration");
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { note?: string };
    expect(body.note ?? "").toContain("再デプロイ");
  });

  test("the console shell renders after sign-in", async ({ page }) => {
    await loginConsole(page);
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
