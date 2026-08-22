import { expect, test } from "@playwright/test";
import { installWebAuthnVirtualCredential } from "./helpers/webauthn-smoke";

test.describe("steward chat webauthn smoke", () => {
  test("budget gate loads (Codex 予実; WebAuthn optional via Wire/prod)", async ({ page }) => {
    await page.goto("about:blank");
    await installWebAuthnVirtualCredential(page);
    await page.goto("/");

    // Codex 予実 default gate is zero-trust budget login (dev passkey).
    await expect(page.getByRole("heading", { name: "予算ログイン" })).toBeVisible({
      timeout: 15_000,
    });
    const webauthn = page.getByRole("button", {
      name: /Touch ID で入る|Touch ID で登録|Sign in \(WebAuthn\)|WebAuthn|passkey/i,
    });
    if (await webauthn.count()) {
      await webauthn.first().click();
      await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
        timeout: 15_000,
      });
    }
  });
});
