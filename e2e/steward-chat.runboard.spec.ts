import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { loginConsole as login } from "./helpers/console-login";

const SEED_ID = "IMP-E2E-SEED-001";
const SEED_FAIL_ID = "IMP-E2E-SEED-FAIL";
const DEMO_QUEUE = join(process.cwd(), "tenants/demo/docs/reports/routing-queue");

function seedWorkOrder(id: string, status: "pending" | "failed", subject?: string): void {
  mkdirSync(DEMO_QUEUE, { recursive: true });
  writeFileSync(
    join(DEMO_QUEUE, `${id}.yaml`),
    [
      `id: ${id}`,
      `created_at: "2026-08-24T00:00:00.000Z"`,
      "from_agent: executive_steward",
      "to_agent: finance",
      "task_type: implement",
      "mode: implement",
      "access:",
      "  allowed: true",
      "  reason: e2e run board seed",
      "context:",
      "  text: e2e run board seed",
      subject ? `subject: ${subject}` : "",
      `status: ${status}`,
      "depends_on: []",
      "deliverables: []",
      "acceptance_criteria: []",
      "",
    ]
      .filter(Boolean)
      .join("\n"),
    "utf-8"
  );
}

/**
 * The plan sidebar and a work order's title both render as buttons, so a bare
 * name lookup is ambiguous. Board assertions go through the kanban card.
 */
function kanbanCard(page: import("@playwright/test").Page, name: string | RegExp) {
  return page.locator(".orchestration-kanban-card").filter({ hasText: name });
}

function removeSeededWorkOrder(id: string): void {
  for (const ext of [".yaml", ".md"]) {
    const path = join(DEMO_QUEUE, `${id}${ext}`);
    if (existsSync(path)) rmSync(path);
  }
}

function runsTab(page: import("@playwright/test").Page) {
  return page
    .getByRole("navigation", { name: "AIチームメニュー" })
    .getByRole("link", { name: "実行状況" });
}

test.describe("steward chat run board", () => {
  test("Run Board tab renders orchestration runs from the BFF", async ({ page }) => {
    // The plan sidebar only exists when at least one work order is in flight,
    // and the demo queue is empty on a clean checkout.
    seedWorkOrder(SEED_ID, "pending", "E2E 予実レビュー");
    try {
      await login(page);
      await page
        .getByRole("navigation", { name: "Operator Console" })
        .getByRole("link", { name: "AIチーム" })
        .click();
      await runsTab(page).click();

      await expect(page.getByRole("heading", { name: "実行状況" })).toBeVisible();
      await expect(page).toHaveURL(/\/runs\/?$/);
      await expect(page.getByRole("heading", { name: "進行中の計画" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator(".error-banner")).toHaveCount(0);
      await expect(kanbanCard(page, "E2E 予実レビュー").first()).toBeVisible();
    } finally {
      removeSeededWorkOrder(SEED_ID);
    }
  });

  test("/runs/ deep link opens Run Board directly", async ({ page }) => {
    await login(page);
    await page.goto("/runs/");

    await expect(page.getByRole("heading", { name: "実行状況" })).toBeVisible();
    await expect(runsTab(page)).toHaveAttribute("aria-current", "page");
  });

  test("legacy ?runs=1 redirects to /runs/", async ({ page }) => {
    await login(page);
    await page.goto("/?runs=1");
    await expect(page).toHaveURL(/\/runs\/?$/);
  });

  test("seeded pending work order shows in 未着手 column", async ({ page }) => {
    seedWorkOrder(SEED_ID, "pending", "E2E 予実レビュー");
    try {
      await login(page);
      await page.goto("/runs/");

      await expect(page.getByRole("heading", { name: "実行状況" })).toBeVisible();
      const card = kanbanCard(page, "E2E 予実レビュー").first();
      await expect(card).toBeVisible();
      await card.click();

      await expect(page.locator(".orchestration-detail-panel")).toBeVisible();
      await expect(page.getByRole("button", { name: "失敗を再試行" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "未実行を停止" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Steward チャットで開く" })).toBeVisible();
    } finally {
      removeSeededWorkOrder(SEED_ID);
    }
  });

  test("retry failed work order moves node to 未着手", async ({ page }) => {
    seedWorkOrder(SEED_FAIL_ID, "failed", "E2E 失敗テスト");
    try {
      await login(page);
      await page.goto("/runs/");

      const card = kanbanCard(page, "E2E 失敗テスト").first();
      await expect(card).toBeVisible();
      await card.click();

      await expect(page.locator(".orchestration-status.is-alert").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "失敗を再試行" })).toBeVisible();

      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "失敗を再試行" }).click();

      await expect(page.getByRole("button", { name: "失敗を再試行" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "未実行を停止" })).toBeVisible();
    } finally {
      removeSeededWorkOrder(SEED_FAIL_ID);
    }
  });

  test("complete checkbox hides card from incomplete view", async ({ page }) => {
    const completeId = "IMP-E2E-SEED-COMPLETE";
    seedWorkOrder(completeId, "pending", "E2E 完了テスト");
    try {
      await login(page);
      await page.goto("/runs/");

      const card = kanbanCard(page, "E2E 完了テスト");
      await expect(card.first()).toBeVisible();
      const wrap = page
        .locator(".orchestration-kanban-card-wrap")
        .filter({ hasText: "E2E 完了テスト" });

      page.once("dialog", (dialog) => dialog.accept());
      await wrap.getByRole("button", { name: "このタスクを完了" }).click();

      await expect(card).toHaveCount(0);

      await page
        .locator(".orchestration-filter-chip")
        .filter({ hasText: /^完了$/ })
        .click();
      await expect(card.first()).toBeVisible();

      page.once("dialog", (dialog) => dialog.accept());
      await wrap.getByRole("button", { name: "完了を元に戻す" }).click();

      // Reopening refetches the board, so the chip row is replaced mid-click.
      await expect
        .poll(
          async () => {
            const chip = page.locator(".orchestration-filter-chip").filter({ hasText: /^未完了$/ });
            await chip.click({ timeout: 5_000 }).catch(() => undefined);
            return card.count();
          },
          { timeout: 30_000 }
        )
        .toBeGreaterThan(0);
    } finally {
      removeSeededWorkOrder(completeId);
    }
  });
});
