import { expect, test } from "@playwright/test";
import { expandSettingsSection } from "./helpers/settings-accordion";
import {
  installHybridVirtualAuthenticator,
  installWebAuthnVirtualCredential,
} from "./helpers/webauthn-smoke";

test.describe("wire console settlement passkey smoke", () => {
  test("registers settlement passkey on /settings/ after login", async ({ page }) => {
    await page.goto("about:blank");
    await installWebAuthnVirtualCredential(page);
    await installHybridVirtualAuthenticator(page);
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Touch ID で入る" })).toBeVisible();
    await page.getByRole("button", { name: "Touch ID で入る" }).click();

    await expect(page.getByRole("link", { name: "連携", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
      { timeout: 15_000 },
    );

    await page.goto("/settings/");
    await expect(page.getByRole("heading", { name: "ログイン PassKey" })).toBeVisible();
    await expandSettingsSection(page, "決済 PassKey（iPhone）");

    await page.getByRole("button", { name: "iPhone で登録" }).click();
    await expect(page.getByRole("cell", { name: "iPhone（決済）" })).toBeVisible({
      timeout: 20_000,
    });
  });
});
