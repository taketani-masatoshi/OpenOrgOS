import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Dev passkey").fill("orgos-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
}

test.describe("steward chat smoke", () => {
  test("login, today panel, streaming ask with mock LLM", async ({ page }) => {
    await login(page);

    await expect(page.getByRole("heading", { name: "Steward Chat" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "KPI" })).toBeVisible();

    const input = page.getByPlaceholder("来週の支払いリスクは？");
    await input.fill("来週の支払いリスクは？");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".msg.assistant").last()).toContainText("モック", {
      timeout: 15_000,
    });
    await expect(
      page.locator(".msg.assistant").last().locator(".action-list, .msg-meta")
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows pipeline complete toast from SSE", async ({ page }) => {
    await login(page);
    await expect(page.locator(".toast")).toContainText("Daily pipeline 完了", {
      timeout: 10_000,
    });
  });
});
