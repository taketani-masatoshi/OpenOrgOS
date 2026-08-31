import { expect, test, type APIRequestContext } from "@playwright/test";
import { loginAndOpenWire } from "./helpers/console-login";
import { reseedDemoWire } from "./helpers/demo-seed";

/**
 * Proposed against `aiac`, not `demo`: unit tests restore `tenants/demo/data`
 * from git before every test, while `aiac` is one of the operational tenants
 * whose committed peers survive restore. `invoice.issued` needs no contract
 * fixture, so this only exercises the approval path.
 *
 * Proposed as OP-002 because self-approval is refused — the browser session
 * (OP-001, ceo) has to be a different person than the proposer.
 */
async function proposePendingNotice(request: APIRequestContext): Promise<string> {
  const login = await request.post("/chat/v1/auth/login", {
    data: { passkey: "orgos-dev", operator_id: "OP-002", approver_id: "OP-002" },
  });
  expect(login.status(), await login.text()).toBe(200);

  const invoiceId = `INV-E2E-${Date.now()}`;
  const res = await request.post("/console/v1/tenants/aiac/notices/propose", {
    data: {
      peer_id: "PEER-001",
      transaction_type: "invoice.issued",
      invoice_id: invoiceId,
      message: "E2E — 承認待ちの通知",
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  return invoiceId;
}

test.describe("steward chat wire", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    reseedDemoWire();
  });

  test("shows approval-wait folder after login", async ({ page }) => {
    await loginAndOpenWire(page);
    await expect(page.locator("button.mail-folder").filter({ hasText: "相手送信待ち" })).toBeVisible();
  });

  test("flushes wire delivery queue from advanced panel", async ({ page }) => {
    await loginAndOpenWire(page);
    await page.getByText("配送・公証").click();
    const deliveryPanel = page.locator("section.panel").filter({ hasText: "配送" }).first();
    const flushBtn = deliveryPanel.getByRole("button", { name: "未送信を処理" }).first();
    await expect(flushBtn).toBeVisible({ timeout: 10_000 });

    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/delivery/flush-pending") && r.request().method() === "POST",
      ),
      flushBtn.click(),
    ]);
  });

  test("approve wire pending from 承認待ち folder", async ({ page, request }) => {
    const invoiceId = await proposePendingNotice(request);
    await loginAndOpenWire(page);
    await page.reload();
    const oursFolder = page.locator("button.mail-folder").filter({ hasText: "承認待ち" });
    await expect(oursFolder).toBeVisible({ timeout: 20_000 });
    await oursFolder.click();

    const row = page.locator(".message-row").filter({ hasText: invoiceId });
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.click();
    await page.getByRole("button", { name: "承認", exact: true }).click();

    await expect(row).toHaveCount(0, { timeout: 20_000 });
  });
});
