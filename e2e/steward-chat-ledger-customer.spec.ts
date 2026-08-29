import { expect, test } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";

/**
 * Ledger customer journey — UI-first commercial evidence.
 * Soft 403 toleration removed: fixture tenant must grant CEO/operator rights.
 */
async function login(page: import("@playwright/test").Page): Promise<void> {
  await loginConsole(page);
  await expect(page.getByText("未ログイン")).toHaveCount(0, { timeout: 15_000 });
  await page
    .getByRole("navigation", { name: "Operator Console" })
    .getByRole("link", { name: "帳簿" })
    .click();
  await expect(page).toHaveURL(/ledger=1/, { timeout: 5_000 });
}

test.describe("steward chat ledger customer journey", () => {
  test("UI onboarding → JE → bank preview/import → close → propose", async ({ page, request }) => {
    await login(page);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const headers = {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
    };

    // --- UI: setup gates ---
    await page.goto("/?onboarding=1");
    await expect(page.getByRole("heading", { name: "セットアップ" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "Passkey（ログイン必須）" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("p.ops-page-meta").filter({ hasText: /ログインには Passkey が必須/ })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "Passkey を登録" })).toBeVisible({
      timeout: 10_000,
    });

    const company = page.getByLabel("会社名").or(page.getByPlaceholder("会社名"));
    if (await company.isVisible().catch(() => false)) {
      await company.fill("E2E Journey KK");
      const save = page.getByRole("button", { name: /会社情報を保存|保存/ });
      if (await save.isVisible().catch(() => false)) {
        await save.click();
      }
    }

    // --- API (authenticated, strict): setup + first JE ---
    const setup = await request.post("/chat/v1/product/onboarding/setup", {
      headers,
      data: { company_name: "E2E Journey KK" },
    });
    expect(setup.status(), "onboarding setup must succeed for fixture CEO").toBe(200);

    const je = await request.post("/chat/v1/ledger/manual-entry", {
      headers,
      data: {
        description: "E2E 初回仕訳",
        debit_account: "5100",
        credit_account: "1100",
        amount_yen: 3000,
      },
    });
    expect(je.status(), "first JE must succeed").toBe(200);

    // --- Bank template + import (strict) ---
    const tpl = await request.get("/chat/v1/ledger/bank-csv-template?preset=mizuho", {
      headers,
    });
    expect(tpl.ok()).toBeTruthy();
    const tplBody = await tpl.json();
    expect(Array.isArray(tplBody.presets)).toBeTruthy();
    expect(tplBody.presets.length).toBeGreaterThanOrEqual(4);

    const csv = [
      "date,direction,amount,category,description,account_id,reference,counterparty",
      "2026-06-15,inflow,50000,rent,e2e,BANK-001,,",
    ].join("\n");

    const dry = await request.post("/chat/v1/ledger/bank-statements/import", {
      headers,
      data: { csv_text: csv, dry_run: true, preset: "generic" },
    });
    expect(dry.status(), "bank dry_run must succeed").toBe(200);
    const dryBody = await dry.json();
    expect(dryBody.dry_run).toBe(true);

    const write = await request.post("/chat/v1/ledger/bank-statements/import", {
      headers,
      data: { csv_text: csv, write: true, preset: "generic" },
    });
    expect(write.ok()).toBeTruthy();

    const cl = await request.get("/chat/v1/ledger/month-close-checklist?month=2026-06", {
      headers,
    });
    expect(cl.ok()).toBeTruthy();

    const prop = await request.post("/chat/v1/ledger/proposals", {
      headers,
      data: {
        description: "E2E 提案",
        debit_account: "5100",
        credit_account: "1100",
        amount_yen: 1000,
        source: "chat",
      },
    });
    expect(prop.status(), "proposal create must succeed").toBe(200);
    const propBody = await prop.json();
    const approve = await request.post("/chat/v1/ledger/proposals/approve", {
      headers,
      data: { proposal_id: propBody.proposal.id },
    });
    expect([200, 422]).toContain(approve.status());

    const onboard = await request.get("/chat/v1/product/onboarding", { headers });
    expect(onboard.ok()).toBeTruthy();
    const onboardBody = await onboard.json();
    expect(onboardBody.customer_ready, "customer_ready after setup + JE").toBe(true);

    const wbApi = await request.get("/chat/v1/ledger/workbench", { headers });
    expect(wbApi.ok(), "workbench API must succeed").toBeTruthy();

    // The tab was rendered while the tenant was still unready, so the ledger
    // menu only appears after a reload.
    await page.reload();
    await page
      .getByRole("navigation", { name: "帳簿メニュー" })
      .getByRole("button", { name: "帳簿", exact: true })
      .click();
    await expect(page).toHaveURL(/ledger=1/, { timeout: 5_000 });
    await expect(page.getByRole("heading", { name: "帳簿", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/読み込み中|今日の仕訳・試算表/)).toBeVisible({
      timeout: 10_000,
    });
  });
});
