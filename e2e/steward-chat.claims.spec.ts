import { expect, test } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";
import { loginApi } from "./helpers/api-login";

/**
 * QR receipts and expense claims against the running console: a preview must
 * not persist, and no claim may move toward reimbursement without the
 * optimistic revision that proves the caller saw its current state.
 */
test.describe("steward chat receipts and expense claims", () => {
  test("receipt surface opens for an operator", async ({ page }) => {
    await loginConsole(page);
    await page.goto("/?receipt-issue=1");
    await expect(page.locator(".receipt-issue").first()).toBeVisible({ timeout: 15_000 });
  });

  test("receipt preview does not persist", async ({ request }) => {
    await loginApi(request);
    const before = await request.get("/chat/v1/receipts");
    expect(before.status(), await before.text()).toBe(200);
    const beforeIds = ((await before.json()) as { receipts: Array<{ receipt_id: string }> })
      .receipts.map((r) => r.receipt_id);

    const res = await request.post("/chat/v1/receipts/preview", {
      data: {
        document_type: "qualified_invoice",
        transaction_date: "2026-08-01",
        recipient_name: "取引先株式会社",
        lines: [
          {
            description: "コンサルティング",
            tax_rate: 10,
            amount_excluding_tax: 100_000,
            tax_amount: 10_000,
            amount_including_tax: 110_000,
          },
        ],
      },
    });
    // The demo tenant has no corporate number, so a qualified invoice cannot be
    // issued at all — and the refusal must be stated, not silently persisted.
    expect(res.status(), await res.text()).toBe(422);
    expect(((await res.json()) as { error: string }).error).toContain("corporate_number");

    const after = await request.get("/chat/v1/receipts");
    const afterIds = ((await after.json()) as { receipts: Array<{ receipt_id: string }> })
      .receipts.map((r) => r.receipt_id);
    expect(afterIds).toEqual(beforeIds);
  });

  test("unknown receipt is a 404, not an empty success", async ({ request }) => {
    await loginApi(request);
    const res = await request.get("/chat/v1/receipts/RCP-does-not-exist");
    expect(res.status()).toBe(404);
  });

  test("expense claim approval needs the expected revision", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/org/budget/expense-claim/approve", {
      data: { claim_id: "EXP-001" },
    });
    expect(res.status()).toBe(422);
    expect((await res.json()) as { code: string }).toMatchObject({
      code: "expected_claim_revision_required",
    });
  });

  test("reimbursing an unknown claim is refused", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/org/budget/expense-claim/reimburse", {
      data: {
        claim_id: "EXP-does-not-exist",
        expected_claim_revision: 1,
        payment_ref: "TX-1",
      },
    });
    expect(res.status()).toBe(422);
  });

  test("claim desk needs a session", async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
    });
    const res = await anonymous.get("/chat/v1/org/budget/expense-claim/desk");
    expect(res.status()).toBe(401);
    await anonymous.dispose();
  });
});
