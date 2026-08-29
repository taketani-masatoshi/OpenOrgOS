/**
 * Smoke: receipt issue / claim tabs render under Operator Console.
 * Full issuer↔claimant Wire round-trip needs multi-tenant fixtures — covered by unit tests.
 */
import { test, expect } from "@playwright/test";

test.describe("steward-chat receipt surfaces", () => {
  test.skip(
    !process.env.ORGOS_E2E_OPERATOR_CONSOLE,
    "Set ORGOS_E2E_OPERATOR_CONSOLE=1 with local operator console",
  );

  test("receipt claim and issue tabs are reachable under 取引", async ({ page }) => {
    const base = process.env.ORGOS_E2E_BASE_URL ?? "http://127.0.0.1:4173";
    await page.goto(`${base}/?receipt=1`);
    await expect(page.getByRole("heading", { name: /領収書の受け取り/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "取引" })
    ).toHaveAttribute("aria-current", "page");
    await page
      .getByRole("navigation", { name: "取引メニュー" })
      .getByRole("button", { name: "領収書発行" })
      .click();
    await expect(page.getByRole("heading", { name: /領収書発行/ })).toBeVisible();
  });
});
