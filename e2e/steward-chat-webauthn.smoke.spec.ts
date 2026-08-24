import { expect, test } from "@playwright/test";
import { installWebAuthnVirtualCredential } from "./helpers/webauthn-smoke";

test.describe("steward chat webauthn smoke", () => {
  test("unauthenticated /settings shows Community handoff", async ({ page }) => {
    await page.goto("/settings");

    await expect(
      page.getByRole("heading", { name: "PassKey 設定の前に Community でログイン" }),
    ).toBeVisible({ timeout: 15_000 });

    const handoff = page.getByRole("link", { name: /Community で Google ログイン|Community で入る/ });
    await expect(handoff.first()).toBeVisible();
    const href = await handoff.first().getAttribute("href");
    expect(href).toContain(encodeURIComponent("/settings"));
  });

  test("budget gate loads with WebAuthn login (localhost)", async ({ page }) => {
    await page.goto("about:blank");
    await installWebAuthnVirtualCredential(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "この Mac で入る" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Touch ID で入る" }).click();

    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
      timeout: 15_000,
    });
  });
});
