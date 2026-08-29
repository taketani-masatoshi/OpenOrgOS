import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.locator("#orgos-login-operator").fill("OP-001");
  await page.locator("#orgos-login-password").fill("orgos-dev");
  await page.locator("#orgos-login-submit").click();
  await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("steward chat smoke", () => {
  test("login shows executive home by default without chat UI", async ({ page }) => {
    await login(page);

    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "経営" })
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "経営ダッシュボード" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "チャット" })).toHaveCount(0);
    await expect(page.getByPlaceholder("来週の支払いリスクは？")).toHaveCount(0);
  });

  test("予実 wallet is reachable from shell tab", async ({ page }) => {
    await login(page);
    await page
      .getByRole("navigation", { name: "Operator Console" })
      .getByRole("link", { name: "予実" })
      .click();
    await expect(page).toHaveURL(/wallet=1/, { timeout: 5_000 });
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "予実" })
    ).toHaveAttribute("aria-current", "page");
  });
});
