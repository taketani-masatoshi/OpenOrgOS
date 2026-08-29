import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.locator("#orgos-login-operator").fill("OP-001");
  await page.locator("#orgos-login-password").fill("orgos-dev");
  await page.locator("#orgos-login-submit").click();
  await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
    timeout: 15_000,
  });
}

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf-8",
);

test.describe("national eID signing desk", () => {
  test("creates a case from an uploaded PDF and lists it with a digest", async ({ page }) => {
    await login(page);
    await page.goto("/?esign=1");

    await expect(page.getByRole("heading", { name: "国家 eID 署名" })).toBeVisible({
      timeout: 15_000,
    });
    // The signing step itself stays on the signer's device (ADR 0014).
    await expect(page.getByText("DigiDoc4 とカードで署名し")).toBeVisible();

    await page.getByLabel("件名").fill("E2E 秘密保持契約");
    await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles({
      name: "nda.pdf",
      mimeType: "application/pdf",
      buffer: PDF,
    });
    await page.getByRole("button", { name: "作成" }).click();

    const row = page.locator("table.ops-table tbody tr").filter({
      hasText: "E2E 秘密保持契約",
    });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("draft");
  });
});
