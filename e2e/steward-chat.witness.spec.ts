import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Dev passkey").fill("orgos-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
}

test.describe("steward chat witness", () => {
  test.describe.configure({ mode: "serial" });

  test("shows witness pending section with register action", async ({ page }) => {
    await login(page);

    await expect(page.locator(".stats")).toContainText("Witness: 1", { timeout: 10_000 });

    const witnessHeading = page.getByRole("heading", { name: /^Witness \(\d+\)/ });
    await expect(witnessHeading).toBeVisible();
    await expect(witnessHeading).toContainText("Witness (1)");
    await expect(page.getByRole("button", { name: "Register sent" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Register received" }).first()).toBeVisible();
    await expect(page.locator(".stats")).toContainText("Witness: 1");
  });

  test("registers sent and received then verifies quorum", async ({ page }) => {
    await login(page);

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/chat/v1/wire/witness/register") && r.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Register sent" }).first().click(),
    ]);

    await expect(page.getByRole("button", { name: "Register received" }).first()).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/chat/v1/wire/witness/register") && r.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Register received" }).first().click(),
    ]);

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/chat/v1/wire/witness/verify") && r.request().method() === "POST"
      ),
      page.getByRole("button", { name: "Verify" }).first().click(),
    ]);

    await expect(page.locator(".toast")).toContainText("Witness quorum OK");
  });
});
