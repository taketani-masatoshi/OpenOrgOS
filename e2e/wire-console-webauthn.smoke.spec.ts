import { expect, test } from "@playwright/test";
import { installWebAuthnVirtualCredential } from "./helpers/webauthn-smoke";

test.describe("wire console webauthn smoke", () => {
  test("prod passkey login via CDP virtual authenticator", async ({ page }) => {
    await page.goto("about:blank");
    await installWebAuthnVirtualCredential(page);
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Touch ID で入る" })).toBeVisible();
    await page.getByRole("button", { name: "Touch ID で入る" }).click();

    await expect(page.getByRole("link", { name: "連携", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
      { timeout: 15_000 }
    );
    await expect(page.getByText(/OP-001/)).toBeVisible();
    await expect(page.getByText(/承認者 段燕燕/)).toBeVisible();
  });
});
