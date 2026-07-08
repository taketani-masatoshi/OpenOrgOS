import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Dev passkey").fill("orgos-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
}

test.describe("steward chat wire", () => {
  test.describe.configure({ mode: "serial" });

  test("shows wire delivery pending section after seed", async ({ page }) => {
    await login(page);

    const deliverySection = page.locator("section").filter({
      has: page.getByRole("heading", { name: /^配送待ち \(\d+\)/ }),
    });
    await expect(deliverySection).toBeVisible();
    await expect(deliverySection.getByText("PEER-001")).toBeVisible();
  });

  test("flushes wire delivery queue from delivery pending section", async ({ page }) => {
    await login(page);

    const deliverySection = page.locator("section").filter({
      has: page.getByRole("heading", { name: /^配送待ち \(\d+\)/ }),
    });
    const flushBtn = deliverySection.getByRole("button", { name: "Flush" });
    await expect(flushBtn).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/chat/v1/wire/flush") && r.request().method() === "POST"
      ),
      flushBtn.click(),
    ]);

    await expect(page.locator(".toast")).toContainText("Wire flush:");
  });

  test("approve wire human-mail pending from Today panel", async ({ page }) => {
    await login(page);

    const wireHeading = page.getByRole("heading", { name: /^Wire \(\d+\)/ });
    await expect(wireHeading).toBeVisible();

    const statsBefore = await page.locator(".stats").textContent();
    const countBefore = Number(statsBefore?.match(/Wire:\s*(\d+)/)?.[1] ?? "0");
    expect(countBefore).toBeGreaterThan(0);

    const approveBtn = page.getByRole("button", { name: "承認" }).first();
    await expect(approveBtn).toBeVisible();
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/chat/v1/approvals/") &&
          r.url().endsWith("/approve") &&
          r.request().method() === "POST"
      ),
      approveBtn.click(),
    ]);

    await expect
      .poll(async () => {
        const text = await page.locator(".stats").textContent();
        return Number(text?.match(/Wire:\s*(\d+)/)?.[1] ?? "0");
      })
      .toBeLessThan(countBefore);
  });
});
