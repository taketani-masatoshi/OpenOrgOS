import { expect, test } from "@playwright/test";

async function loginAndOpenWire(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.locator("#orgos-login-operator").fill("OP-001");
  await page.locator("#orgos-login-password").fill("orgos-dev");
  await page.locator("#orgos-login-submit").click();
  await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/wire/");
  await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible();
}

test.describe("steward chat witness", () => {
  test.describe.configure({ mode: "serial" });

  test("witness controls available in advanced panel", async ({ page }) => {
    await loginAndOpenWire(page);
    await page.getByText("配送・公証（オペレータ向け）").click();
    const witnessPanel = page.locator("section.panel").filter({ hasText: "Witness" });
    await expect(witnessPanel).toBeVisible({ timeout: 10_000 });
  });
});
