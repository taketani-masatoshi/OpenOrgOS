import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const SEED_ID = "IMP-E2E-SEED-001";
const SEED_FAIL_ID = "IMP-E2E-SEED-FAIL";
const DEMO_QUEUE = join(process.cwd(), "tenants/demo/docs/reports/routing-queue");

function seedWorkOrder(id: string, status: "pending" | "failed"): void {
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
      `status: ${status}`,
      "depends_on: []",
      "deliverables: []",
      "acceptance_criteria: []",
      "",
    ].join("\n"),
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

function runBoardTab(page: import("@playwright/test").Page) {
  return page
    .getByRole("navigation", { name: "予実メニュー" })
    .getByRole("button", { name: "Run Board" });
}

test.describe("steward chat run board", () => {
  test("Run Board tab renders orchestration runs from the BFF", async ({ page }) => {
    await login(page);
    await runBoardTab(page).click();

    await expect(page.getByRole("heading", { name: "Run Board" })).toBeVisible();
    await expect(page).toHaveURL(/[?&]runs=1/);
    await expect(page.getByRole("heading", { name: "アクティブ plan" })).toBeVisible();
    await expect(page.locator(".error-banner")).toHaveCount(0);

    // Demo tenant may have no in-flight plan: either the chip list or the empty state is valid.
    const chips = page.locator(".orchestration-root-chip");
    const empty = page.locator(".empty-panel");
    await expect(chips.or(empty).first()).toBeVisible();
  });

  test("runs=1 deep link opens Run Board directly", async ({ page }) => {
    await login(page);
    await page.goto("/?runs=1");

    await expect(page.getByRole("heading", { name: "Run Board" })).toBeVisible();
    await expect(runBoardTab(page)).toHaveAttribute("aria-current", "page");
  });

  test("seeded pending work order shows as 待機", async ({ page }) => {
    seedWorkOrder(SEED_ID, "pending");
    try {
      await login(page);
      await page.goto("/?runs=1");

      await expect(page.getByRole("heading", { name: "Run Board" })).toBeVisible();
      const chip = page.getByRole("button", { name: SEED_ID });
      await expect(chip).toBeVisible();
      await chip.click();

      await expect(page.locator(".orchestration-status").first()).toHaveText("待機");
      await expect(page.getByRole("button", { name: "失敗を再試行" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "未実行を停止" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Steward チャットで開く" })).toBeVisible();
    } finally {
      removeSeededWorkOrder(SEED_ID);
    }
  });

  test("retry failed work order moves node to 待機", async ({ page }) => {
    seedWorkOrder(SEED_FAIL_ID, "failed");
    try {
      await login(page);
      await page.goto("/?runs=1");

      const chip = page.getByRole("button", { name: SEED_FAIL_ID });
      await expect(chip).toBeVisible();
      await chip.click();

      await expect(page.locator(".orchestration-status").first()).toHaveText("失敗");
      await expect(page.getByRole("button", { name: "失敗を再試行" })).toBeVisible();

      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "失敗を再試行" }).click();

      await expect(page.locator(".orchestration-status").first()).toHaveText("待機");
      await expect(page.getByRole("button", { name: "失敗を再試行" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "未実行を停止" })).toBeVisible();
    } finally {
      removeSeededWorkOrder(SEED_FAIL_ID);
    }
  });
});
