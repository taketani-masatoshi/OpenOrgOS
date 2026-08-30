import { expect, test } from "@playwright/test";
import { expandSettingsSection } from "./helpers/settings-accordion";
import { installHybridVirtualAuthenticator, installWebAuthnVirtualCredential } from "./helpers/webauthn-smoke";

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

  test("settings page fetches credentials once on mount", async ({ page }) => {
    await page.goto("about:blank");
    await installWebAuthnVirtualCredential(page);

    let configHits = 0;
    let credentialHits = 0;
    await page.route("**/chat/v1/auth/config", async (route) => {
      configHits += 1;
      await route.continue();
    });
    await page.route("**/chat/v1/auth/webauthn/credentials", async (route) => {
      credentialHits += 1;
      await route.continue();
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Touch ID で入る" }).click();
    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
      timeout: 15_000,
    });

    configHits = 0;
    credentialHits = 0;

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "ログイン PassKey" })).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(() => credentialHits, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);

    const credentialsAfterMount = credentialHits;
    const configAfterMount = configHits;

    await page.waitForTimeout(5_000);

    expect(credentialHits).toBe(credentialsAfterMount);
    expect(configHits).toBe(configAfterMount);
    expect(credentialHits).toBe(1);
    expect(configHits).toBeLessThanOrEqual(1);
  });

  test("settlement registration sets busy on manage panel", async ({ page }) => {
    await page.goto("about:blank");
    await installWebAuthnVirtualCredential(page);
    await installHybridVirtualAuthenticator(page);

    await page.route("**/chat/v1/auth/webauthn/register/options", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Touch ID で入る" }).click();
    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "ログイン PassKey" })).toBeVisible({
      timeout: 15_000,
    });
    await expandSettingsSection(page, "決済 PassKey（iPhone）");

    const registerBtn = page.getByRole("button", { name: "iPhone で登録" });
    await registerBtn.click();
    await expect(page.locator(".passkey-manage-panel[data-busy='true']")).toBeVisible({
      timeout: 5_000,
    });
    await expect(registerBtn).toBeDisabled();
  });
});
