import { expect, test } from "@playwright/test";
import { loginAndOpenWire } from "./helpers/console-login";

test.describe("steward chat witness", () => {
  test.describe.configure({ mode: "serial" });

  test("witness controls available in advanced panel", async ({ page }) => {
    await loginAndOpenWire(page);
    await page.getByText("配送・公証").click();
    const witnessPanel = page.locator("section.panel").filter({ hasText: "公証" }).first();
    await expect(witnessPanel).toBeVisible({ timeout: 10_000 });
    await expect(witnessPanel.getByRole("button", { name: "公証を登録" })).toBeVisible();
  });
});
