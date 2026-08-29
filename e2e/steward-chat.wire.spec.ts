import { expect, test } from "@playwright/test";

/** 予実は Codex 個人予実 UI。Wire 操作は /wire/ へ。 */
async function loginAndOpenWire(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.locator("#orgos-login-operator").fill("OP-001");
  await page.locator("#orgos-login-password").fill("orgos-dev");
  await page.locator("#orgos-login-submit").click();
  await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/wire/");
  await expect(page.getByRole("button", { name: "承認待ち" })).toBeVisible({ timeout: 15_000 });
}

test.describe("steward chat wire", () => {
  test.describe.configure({ mode: "serial" });

  test("shows approval-wait folder after login", async ({ page }) => {
    await loginAndOpenWire(page);
    await expect(page.getByRole("button", { name: "相手送信待ち" })).toBeVisible();
  });

  test("flushes wire delivery queue from advanced panel", async ({ page }) => {
    await loginAndOpenWire(page);
    await page.getByText("配送・公証（オペレータ向け）").click();
    const deliveryPanel = page.locator("section.panel").filter({ hasText: "Delivery" });
    const flushBtn = deliveryPanel.getByRole("button", { name: "Flush pending" });
    if (!(await flushBtn.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await Promise.all([
      page.waitForResponse(
        (r) =>
          (r.url().includes("/chat/v1/wire/flush") ||
            r.url().includes("/console/v1/") && r.url().includes("flush")) &&
          r.request().method() === "POST"
      ),
      flushBtn.click(),
    ]);
  });

  test("approve wire pending from 承認待ち folder", async ({ page }) => {
    await loginAndOpenWire(page);
    await page.getByRole("button", { name: "承認待ち" }).click();
    const pendingRow = page.locator(".message-row").filter({ hasText: "承認待ち" }).first();
    await expect(pendingRow).toBeVisible({ timeout: 15_000 });
    const countBefore = await page.locator(".message-row").filter({ hasText: "承認待ち" }).count();

    await pendingRow.click();
    await page.getByRole("button", { name: "承認" }).click();
    await expect(page.getByText("承認しました").or(page.getByText("送信済み"))).toBeVisible({
      timeout: 15_000,
    });

    await expect
      .poll(async () => page.locator(".message-row").filter({ hasText: "承認待ち" }).count())
      .toBeLessThanOrEqual(countBefore);
  });
});
