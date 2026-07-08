import { expect, test } from "@playwright/test";
import { installWebAuthnVirtualCredential } from "./helpers/webauthn-smoke";

test.describe("steward chat webauthn smoke", () => {
  test("prod passkey login → Today", async ({ page }) => {
    await page.goto("about:blank");
    await installWebAuthnVirtualCredential(page);
    await page.goto("/");

    await expect(page.getByRole("button", { name: /Sign in \(WebAuthn\)/ })).toBeVisible();
    await page.getByRole("button", { name: /Sign in \(WebAuthn\)/ }).click();

    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/E2E WebAuthn/)).toBeVisible();
  });
});
