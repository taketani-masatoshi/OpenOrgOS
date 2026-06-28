import { expect, test } from "@playwright/test";

test("wire console login, tenant tab, propose notice", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Dev passkey").fill("orgos-dev");
  await page.getByLabel("Approver").fill("テスト承認者");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Wire Console" })).toBeVisible();
  await page.getByRole("button", { name: "wire-console-test" }).click();
  await expect(page.getByText("Propose notice")).toBeVisible({ timeout: 15_000 });

  const proposePanel = page.locator("section.panel").filter({ hasText: "Propose notice" });
  await proposePanel.locator("label").filter({ hasText: "peer" }).locator("select").selectOption("PEER-001");
  await proposePanel.getByPlaceholder("CTR-012").fill("CTR-099");
  await proposePanel.getByRole("button", { name: "Propose" }).click();

  await expect(proposePanel.getByText(/Created NOTICE-/)).toBeVisible({ timeout: 10_000 });
});
