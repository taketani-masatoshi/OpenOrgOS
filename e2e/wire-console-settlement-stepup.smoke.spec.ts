import { expect, test } from "@playwright/test";
import { expandSettingsSection } from "./helpers/settings-accordion";
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

    // Hold the options call open so the busy state is observable rather than
    // racing the round trip.
    await page.route("**/webauthn/register/options", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });

    await page.goto("/settings/");
    await expandSettingsSection(page, "決済 PassKey（iPhone）");
    await page.getByRole("button", { name: /^iPhone で登録$|^別の iPhone で登録$/ }).click();
    await expect(page.locator(".passkey-manage-panel[data-busy='true']")).toBeVisible({
      timeout: 5_000,
    });
    // While the ceremony runs the button relabels to the QR wording and locks.
    await expect(
      page
        .locator("details.settings-accordion-item")
        .filter({ has: page.getByRole("heading", { name: "決済 PassKey（iPhone）", exact: true }) })
        .locator(".settings-accordion-body button")
        .first(),
    ).toBeDisabled();
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
    await page.getByRole("button", { name: "iPhone で承認を開始" }).click();
    await expect(page.getByText("承認しました")).toBeVisible({ timeout: 30_000 });
  });
});
