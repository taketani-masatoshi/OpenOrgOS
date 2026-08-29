import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  const password = page.getByLabel("パスワード", { exact: true });
  if (await password.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await password.fill("orgos-dev");
    await page.getByRole("button", { name: "入る", exact: true }).click();
  } else {
    await page.getByLabel("パスワード（dev passkey）").fill("orgos-dev");
    await page.getByRole("button", { name: "ログイン" }).click();
  }
  await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("steward chat console IA", () => {
  test("budget subnav excludes ledger, tax, setup, fleet, receipts", async ({ page }) => {
    await login(page);
    await page
      .getByRole("navigation", { name: "Operator Console" })
      .getByRole("link", { name: "予実" })
      .click();
    await expect(page).toHaveURL(/wallet=1/, { timeout: 5_000 });

    const budgetNav = page.getByRole("navigation", { name: "予実メニュー" });
    await expect(budgetNav.getByRole("button", { name: "個人予実" })).toBeVisible();
    await expect(budgetNav.getByRole("button", { name: "分析" })).toBeVisible();
    await expect(budgetNav.getByRole("button", { name: "予算管理" })).toBeVisible();
    await expect(budgetNav.getByRole("button", { name: "帳簿", exact: true })).toHaveCount(0);
    await expect(budgetNav.getByRole("button", { name: "税務" })).toHaveCount(0);
    await expect(budgetNav.getByRole("button", { name: "セットアップ" })).toHaveCount(0);
    await expect(budgetNav.getByRole("button", { name: "フリート運用" })).toHaveCount(0);
    await expect(budgetNav.getByRole("button", { name: "領収書発行" })).toHaveCount(0);
  });

  test("settings accordion links open setup and account pages", async ({ page }) => {
    await login(page);
    await page.goto("/settings/");
    await expect(page.getByRole("heading", { name: "設定" })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: "セットアップを開く" }).click();
    await expect(page.getByRole("heading", { name: "セットアップ" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("navigation", { name: "帳簿メニュー" })).toHaveCount(0);

    await page.goto("/settings/");
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
      }),
    ).toHaveCount(0);
  });

  test("legacy tax URL keeps ledger shell tab", async ({ page }) => {
    await login(page);
    await page.goto("/?tax=1");
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "帳簿" })
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "帳簿メニュー" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "税務" })).toBeVisible({ timeout: 15_000 });
  });
});
