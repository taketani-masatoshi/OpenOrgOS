import { expect, test } from "@playwright/test";
import { expandSettingsSection } from "./helpers/settings-accordion";
import { installWebAuthnVirtualCredential } from "./helpers/webauthn-smoke";

function smokePort(): number {
  return Number(process.env.WIRE_CONSOLE_WEBAUTHN_SMOKE_PORT ?? "9473");
}

test.describe("passkey settings stability (wire)", () => {
  test("settings page fetches credentials once on mount", async ({ page }) => {
    await page.goto("about:blank");
    await installWebAuthnVirtualCredential(page);

    let configHits = 0;
    let credentialHits = 0;
    await page.route("**/console/v1/auth/config", async (route) => {
      configHits += 1;
      await route.continue();
    });
    await page.route("**/console/v1/auth/webauthn/credentials", async (route) => {
      credentialHits += 1;
      await route.continue();
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Touch ID で入る" }).click();
    await expect(page.getByRole("link", { name: "Wire", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
      { timeout: 15_000 },
    );

    configHits = 0;
    credentialHits = 0;

    await page.goto("/settings/");
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

  test("127.0.0.1 settings redirects to localhost canonical URL", async ({ page }) => {
    const port = smokePort();
    await page.goto(`http://127.0.0.1:${port}/settings/`);

    await expect(page).toHaveURL(new RegExp(`http://localhost:${port}/settings/`), {
      timeout: 10_000,
    });
    await expect(
      page.getByRole("heading", { name: "PassKey 設定の前に Community でログイン" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Touch ID で入る" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "ログイン PassKey" })).toHaveCount(0);
  });
});
