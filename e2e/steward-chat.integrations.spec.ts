import { expect, test } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";
import { loginApi } from "./helpers/api-login";

/** The connector hub: what is connected, what is gated, and what stays secret. */
test.describe("steward chat integrations", () => {
  test("the hub lists every provider and is reachable from company setup", async ({ page }) => {
    await loginConsole(page);
    await page.goto("/?integrations=1");
    await expect(page.getByRole("heading", { name: "連携設定" })).toBeVisible({
      timeout: 20_000,
    });
    for (const label of ["Slack", "Asana", "Gmail", "Google Drive"]) {
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
    }
  });

  test("company setup links across to the hub", async ({ page }) => {
    await loginConsole(page);
    await page.goto("/?onboarding=1");
    await expect(page.getByRole("link", { name: "連携設定を開く" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("connecting a provider stays behind the platform ship gate", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/integrations/slack/connect", { data: {} });
    expect(res.status(), await res.text()).toBe(403);
    const body = (await res.json()) as { ok?: boolean; platform_ready?: boolean };
    expect(body.ok).toBe(false);
    expect(body.platform_ready).toBe(false);
  });

  test("a saved webhook is never echoed back", async ({ request }) => {
    await loginApi(request);
    const saved = await request.put("/chat/v1/integrations/secrets", {
      data: { ORGOS_SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/E2E/SECRET/VALUE" },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    expect(await saved.text()).not.toContain("E2E/SECRET/VALUE");

    const hub = await request.get("/chat/v1/integrations");
    expect(hub.status()).toBe(200);
    expect(await hub.text()).not.toContain("E2E/SECRET/VALUE");
  });

  test("Drive refuses a raw data path even when asked directly", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/integrations/gdrive/export", {
      data: { kind: "document", id: "data/org/operators.yaml" },
    });
    expect(res.status()).toBe(422);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(false);
  });
});
