import { expect, test, type APIRequestContext } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";
import { loginApi } from "./helpers/api-login";

/**
 * The acts an auditor asks about: can a closed month be reopened silently, is
 * a mistake corrected by reversal, and can 電子帳簿 be searched. Driven against
 * the running console rather than the library.
 */
async function postEntry(request: APIRequestContext, amount: number): Promise<string> {
  const res = await request.post("/chat/v1/ledger/manual-entry", {
    data: {
      description: `E2E 帳簿 ${amount}`,
      debit_account: "5100",
      credit_account: "1100",
      amount_yen: amount,
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { entry_id: string };
  return body.entry_id;
}

test.describe("steward chat books", () => {
  test("ledger workbench renders for a ready tenant", async ({ page }) => {
    await loginConsole(page);
    await page.goto("/?ledger=1");
    await expect(page.getByRole("heading", { name: "帳簿", exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("a mistake is corrected by a reversing entry", async ({ request }) => {
    await loginApi(request);
    const entryId = await postEntry(request, 777);

    const reversed = await request.post("/chat/v1/ledger/reverse", {
      data: { entry_id: entryId },
    });
    expect(reversed.status(), await reversed.text()).toBe(200);
    const body = (await reversed.json()) as { entry_id: string };
    expect(body.entry_id).not.toBe(entryId);
  });

  test("a locked month cannot be posted into, and unlocking needs a reason", async ({
    request,
  }) => {
    await loginApi(request);
    const month = "2026-03";

    const lock = await request.post("/chat/v1/ledger/period", {
      data: { month, action: "lock" },
    });
    expect(lock.status(), await lock.text()).toBe(200);

    const blocked = await request.post("/chat/v1/ledger/manual-entry", {
      data: {
        description: "ロック済みへの記帳",
        debit_account: "5100",
        credit_account: "1100",
        amount_yen: 500,
        occurred_at: `${month}-15`,
      },
    });
    expect([409, 422]).toContain(blocked.status());

    const noReason = await request.post("/chat/v1/ledger/period", {
      data: { month, action: "unlock" },
    });
    expect(noReason.status()).toBe(422);

    const unlocked = await request.post("/chat/v1/ledger/period", {
      data: { month, action: "unlock", reason: "E2E の後始末" },
    });
    expect(unlocked.status(), await unlocked.text()).toBe(200);
  });

  test("電子帳簿 search finds an entry by amount", async ({ request }) => {
    await loginApi(request);
    const amount = 4321;
    await postEntry(request, amount);

    const res = await request.get(
      `/chat/v1/ledger/dencho/search?min_amount=${amount}&max_amount=${amount}`,
    );
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { count: number; hits: Array<{ amount_yen?: number }> };
    expect(body.count).toBeGreaterThan(0);
  });
});
