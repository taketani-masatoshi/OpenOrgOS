import { expect, test } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";
import { loginApi } from "./helpers/api-login";

/**
 * Daily operation on the running console: Today, the dispatch tower, the LLM
 * worker pool, the work-order run board and the Witness Hub. The recurring
 * risk is a suggestion that quietly becomes an action, so most of these checks
 * are about what does *not* happen.
 */
test.describe("steward chat ops", () => {
  test("Today is served as JSON and as markdown", async ({ request }) => {
    await loginApi(request);
    const asJson = await request.get("/chat/v1/today");
    expect(asJson.status(), await asJson.text()).toBe(200);

    const asMarkdown = await request.get("/chat/v1/today.md");
    expect(asMarkdown.status()).toBe(200);
    expect(asMarkdown.headers()["content-type"]).toContain("text/markdown");
  });

  test("Today needs a session", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const res = await anonymous.get("/chat/v1/today");
    expect(res.status()).toBe(401);
    await anonymous.dispose();
  });

  test("the tower classifies without assigning", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/tower/classify", {
      data: { text: "請求書の発行が今月ぶんまだ" },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { ok: boolean; classification?: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.classification?.work_order_ids).toBeUndefined();
  });

  test("assignment refuses an unconfirmed or unknown plan", async ({ request }) => {
    await loginApi(request);
    const unconfirmed = await request.post("/chat/v1/tower/assign", {
      data: { plan_id: "TOWER-nope", confirmed: false },
    });
    expect(unconfirmed.status()).toBe(400);

    const unknown = await request.post("/chat/v1/tower/assign", {
      data: { plan_id: "TOWER-nope", confirmed: true },
    });
    expect(unknown.status()).toBe(404);
  });

  test("the worker pool never hands back an API key", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/llm/workers");
    expect(res.status(), await res.text()).toBe(200);
    const raw = await res.text();
    expect(raw).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
    expect(raw).not.toMatch(/"api_key"\s*:/);
  });

  test("the run board is readable and refuses an unknown work order", async ({ request }) => {
    await loginApi(request);
    const runs = await request.get("/chat/v1/orchestration/runs");
    expect(runs.status(), await runs.text()).toBe(200);

    const retry = await request.post("/chat/v1/orchestration/runs/retry", {
      data: { id: "IMP-does-not-exist" },
    });
    expect(retry.status()).toBeGreaterThanOrEqual(400);
  });

  test("hub status reports whether the public relay is bound", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/hub/status");
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  test("the ops console renders for an operator", async ({ page }) => {
    await loginConsole(page);
    const res = await page.goto("/?ops=1");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
