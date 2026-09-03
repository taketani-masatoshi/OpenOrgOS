import { expect, test } from "@playwright/test";

import { loginConsole as login } from "./helpers/console-login";

test.describe("steward chat console IA", () => {
  test("finance subnav groups recurring finance work", async ({ page }) => {
    await login(page);
    await page
      .getByRole("navigation", { name: "Operator Console" })
      .getByRole("link", { name: "財務" })
      .click();
    await expect(page).toHaveURL(/ledger=1/, { timeout: 5_000 });

    const financeNav = page.getByRole("navigation", { name: "財務メニュー" });
    for (const label of [
      "帳簿",
      "税務",
      "個人予実",
      "分析",
      "予算管理",
      "領収書発行",
      "領収書受け取り",
    ]) {
      await expect(financeNav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await expect(financeNav.getByRole("link", { name: "セットアップ" })).toHaveCount(0);
  });

  test("settings accordion links open setup and account pages", async ({ page }) => {
    await login(page);
    await page.goto("/settings/");
    await expect(page.getByRole("heading", { name: "設定" })).toBeVisible({ timeout: 15_000 });

    // Links live inside collapsed accordion sections.
    await page.getByRole("heading", { name: "会社セットアップ" }).click();
    await page.getByRole("link", { name: "セットアップを開く" }).click();
    await expect(page.getByRole("heading", { name: "セットアップ" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("navigation", { name: "帳簿メニュー" })).toHaveCount(0);

    await page.goto("/settings/");
    await page.getByRole("heading", { name: "アカウント管理" }).click();
    await page.getByRole("link", { name: "アカウントを開く" }).click();
    await expect(page.getByRole("heading", { name: "アカウント" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("removed fleet ops route redirects to home", async ({ page }) => {
    await login(page);
    await page.goto("/ops/");
    await expect(page).toHaveURL(/\/(\?|$)/, { timeout: 5_000 });
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", {
        name: "フリート運用",
      })
    ).toHaveCount(0);
  });

  test("legacy tax URL keeps ledger shell tab", async ({ page }) => {
    await login(page);
    await page.goto("/?tax=1");
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "財務" })
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "財務メニュー" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "税務" })).toBeVisible({ timeout: 15_000 });
  });
});
