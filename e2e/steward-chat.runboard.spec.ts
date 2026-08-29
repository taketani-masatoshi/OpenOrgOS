import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const SEED_ID = "IMP-E2E-SEED-001";
const SEED_FAIL_ID = "IMP-E2E-SEED-FAIL";
const DEMO_QUEUE = join(process.cwd(), "tenants/demo/docs/reports/routing-queue");

function seedWorkOrder(
  id: string,
  status: "pending" | "failed",
  subject?: string,
): void {
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
    "utf-8",
  );
}

function removeSeededWorkOrder(id: string): void {
  for (const ext of [".yaml", ".md"]) {
    const path = join(DEMO_QUEUE, `${id}${ext}`);
    if (existsSync(path)) rmSync(path);
  }
}

/** Dev login form is pre-filled with OP-001 / orgos-dev by BudgetAuthGate. */
async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "入る" }).click();
  await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
    timeout: 15_000,
  });
}

function runsTab(page: import("@playwright/test").Page) {
  return page
    .getByRole("navigation", { name: "Operator Console" })
    .getByRole("link", { name: "実行状況" });
}

test.describe("steward chat run board", () => {
  test("Run Board tab renders orchestration runs from the BFF", async ({ page }) => {
    await login(page);
    await runsTab(page).click();

    await expect(page.getByRole("heading", { name: "実行状況" })).toBeVisible();
    await expect(page).toHaveURL(/\/runs\/?$/);
    await expect(page.getByRole("heading", { name: "進行中の計画" })).toBeVisible();
    await expect(page.locator(".error-banner")).toHaveCount(0);

    const cards = page.locator(".orchestration-kanban-card");
    const empty = page.locator(".empty-state");
    await expect(cards.or(empty).first()).toBeVisible();
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
      const card = page.getByRole("button", { name: /E2E 予実レビュー/ });
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
    seedWorkOrder(SEED_FAIL_ID, "failed");
    try {
      await login(page);
      await page.goto("/runs/");

      const card = page.getByRole("button", { name: SEED_FAIL_ID });
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

      const card = page.getByRole("button", { name: /E2E 完了テスト/ });
      await expect(card).toBeVisible();

      page.once("dialog", (dialog) => dialog.accept());
      await page
        .locator(".orchestration-kanban-card-wrap")
        .filter({ has: page.getByRole("button", { name: /E2E 完了テスト/ }) })
        .getByRole("button", { name: "このタスクを完了" })
        .click();

      await expect(card).toHaveCount(0);

      await page.getByRole("button", { name: "完了" }).click();
      await expect(page.getByRole("button", { name: /E2E 完了テスト/ })).toBeVisible();

      page.once("dialog", (dialog) => dialog.accept());
      await page
        .locator(".orchestration-kanban-card-wrap")
        .filter({ has: page.getByRole("button", { name: /E2E 完了テスト/ }) })
        .getByRole("button", { name: "完了を元に戻す" })
        .click();

      await page.getByRole("button", { name: "未完了" }).click();
      await expect(page.getByRole("button", { name: /E2E 完了テスト/ })).toBeVisible();
    } finally {
      removeSeededWorkOrder(completeId);
    }
  });
});
