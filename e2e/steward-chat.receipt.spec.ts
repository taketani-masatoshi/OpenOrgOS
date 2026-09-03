/**
 * Receipt issue / claim surfaces under Operator Console.
 * Full issuer↔claimant Wire round-trip needs multi-tenant fixtures — covered by unit tests.
 */
import { test, expect } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";

test.describe("steward-chat receipt surfaces", () => {
  test("receipt claim and issue tabs are reachable under 財務", async ({ page }) => {
    await loginConsole(page);
    await page.goto("/?receipt=1");
    await expect(page.getByRole("heading", { name: /領収書の受け取り/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "財務" })
    ).toHaveAttribute("aria-current", "page");
    await page
      .getByRole("navigation", { name: "財務メニュー" })
      .getByRole("link", { name: "領収書発行" })
      .click();
    await expect(page.getByRole("heading", { name: /領収書発行/ })).toBeVisible();
  });
});
