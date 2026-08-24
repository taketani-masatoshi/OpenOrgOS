import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { WIRE_CONSOLE_OIDC_SMOKE_FIXTURE } from "../src/lib/wire-console/paths.js";

test.describe("wire console bootstrap token negative", () => {
  test("invalid bootstrap token shows passkey-setup-error", async ({ page }) => {
    const oidcFixture = JSON.parse(readFileSync(WIRE_CONSOLE_OIDC_SMOKE_FIXTURE, "utf-8")) as {
      id_token: string;
      approver_id: string;
      operator_id: string;
    };

    await page.goto("/");

    const loginRes = await page.request.post("/console/v1/auth/login", {
      data: {
        id_token: oidcFixture.id_token,
        approver_id: oidcFixture.approver_id,
        operator_id: oidcFixture.operator_id,
      },
    });
    expect(loginRes.ok()).toBeTruthy();

    await page.goto("/settings/");

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    const tokenField = page.getByPlaceholder("pkb_…（orgos operator passkey-bootstrap mint）");
    await expect(tokenField).toBeVisible({ timeout: 15_000 });
    await tokenField.fill("pkb_invalid_smoke_token");

    const registerBtn = page.getByRole("button", { name: "Touch ID で登録" });
    await expect(registerBtn).toBeEnabled();
    await registerBtn.click();

    await expect(page.locator(".passkey-setup-error")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".passkey-setup-error")).toContainText(/bootstrap|無効|mint/i);
  });
});
