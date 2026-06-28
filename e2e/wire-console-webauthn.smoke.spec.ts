import { expect, test } from "@playwright/test";
import { installWebAuthnVirtualCredential } from "./helpers/webauthn-smoke";

test.describe("wire console webauthn smoke", () => {
  test("prod passkey login via CDP virtual authenticator", async ({ page }) => {
    await page.goto("about:blank");
    await installWebAuthnVirtualCredential(page);
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Sign in with passkey" })).toBeVisible();
    await page.getByRole("button", { name: "Sign in with passkey" }).click();

    await expect(page.getByRole("heading", { name: "Wire Console" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/E2E WebAuthn/)).toBeVisible();
    await expect(page.getByText(/approver テスト承認者/)).toBeVisible();
  });
});
