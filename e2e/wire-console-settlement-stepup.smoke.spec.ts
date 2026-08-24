import { expect, test } from "@playwright/test";
import {
  installHybridVirtualAuthenticator,
  installWebAuthnVirtualCredential,
} from "./helpers/webauthn-smoke";

test.describe("wire console settlement step-up smoke", () => {
  test("approves tier B wire notice with settlement PassKey ceremony", async ({ page }) => {
    await page.goto("about:blank");
    await installWebAuthnVirtualCredential(page);
    await installHybridVirtualAuthenticator(page);
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Touch ID で入る" })).toBeVisible();
    await page.getByRole("button", { name: "Touch ID で入る" }).click();
    await expect(page.getByRole("link", { name: "Wire", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
      { timeout: 15_000 },
    );

    await page.goto("/settings/");
    await page.getByRole("button", { name: /^iPhone で登録$|^別の iPhone で登録$/ }).click();
    await expect(page.locator(".passkey-manage-panel[data-busy='true']")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("button", { name: /^iPhone で登録$|^別の iPhone で登録$/ })).toBeDisabled();
    await expect(page.getByRole("cell", { name: "iPhone（決済）" })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("/");
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes("/tenants/wire-console-test/messages?folder=all") && resp.ok(),
      ),
      page.getByRole("button", { name: "Wire Console Test Org" }).click(),
    ]);
    await expect(page.getByText("承認待ち 1")).toBeVisible({ timeout: 15_000 });

    const pendingRow = page.locator(".message-row").filter({ hasText: "E2E settlement" }).first();
    await expect(pendingRow).toBeVisible({ timeout: 15_000 });
    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes("/tenants/wire-console-test/messages/approval") && resp.ok(),
      ),
      pendingRow.click(),
    ]);

    await expect(page.locator(".message-reader h2")).toContainText("支払いの指示", {
      timeout: 15_000,
    });
    await page.locator(".message-reader").getByLabel("共同承認者（tier B）").selectOption("テスト承認者");
    await page.locator(".message-reader").getByRole("button", { name: "承認" }).click();

    await expect(page.getByRole("heading", { name: "iPhone の PassKey で承認" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("250,000 JPY")).toBeVisible();
    await expect(page.getByText("承認しました")).toBeVisible({ timeout: 30_000 });
  });
});
