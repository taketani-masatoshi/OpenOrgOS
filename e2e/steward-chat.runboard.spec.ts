import { expect, test } from "@playwright/test";

/** Dev login form is pre-filled with OP-001 / orgos-dev by BudgetAuthGate. */
async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "入る" }).click();
  await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
    timeout: 15_000,
  });
}

function runBoardTab(page: import("@playwright/test").Page) {
  return page
    .getByRole("navigation", { name: "予実メニュー" })
    .getByRole("button", { name: "Run Board" });
}

test.describe("steward chat run board", () => {
  test("Run Board tab renders orchestration runs from the BFF", async ({ page }) => {
    await login(page);
    await runBoardTab(page).click();

    await expect(page.getByRole("heading", { name: "Run Board" })).toBeVisible();
    await expect(page).toHaveURL(/[?&]runs=1/);
    await expect(page.getByRole("heading", { name: "アクティブ plan" })).toBeVisible();
    await expect(page.locator(".error-banner")).toHaveCount(0);

    // Demo tenant may have no in-flight plan: either the chip list or the empty state is valid.
    const chips = page.locator(".orchestration-root-chip");
    const empty = page.locator(".empty-panel");
    await expect(chips.or(empty).first()).toBeVisible();
  });

  test("runs=1 deep link opens Run Board directly", async ({ page }) => {
    await login(page);
    await page.goto("/?runs=1");

    await expect(page.getByRole("heading", { name: "Run Board" })).toBeVisible();
    await expect(runBoardTab(page)).toHaveAttribute("aria-current", "page");
  });
});
