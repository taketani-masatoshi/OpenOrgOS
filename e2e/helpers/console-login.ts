import { expect, type Page } from "@playwright/test";

/**
 * Operator Console dev login. Idempotent: when the session cookie already
 * authenticates the browser context, the gate never renders and we return.
 */
export async function loginConsole(
  page: Page,
  operatorId = "OP-001",
  password = "orgos-dev",
): Promise<void> {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Operator Console" });
  const operator = page.locator("#orgos-login-operator");
  await expect(operator.or(nav).first()).toBeVisible({ timeout: 20_000 });
  if (await operator.isVisible().catch(() => false)) {
    await operator.fill(operatorId);
    await page.locator("#orgos-login-password").fill(password);
    await page.locator("#orgos-login-submit").click();
  }
  await expect(nav).toBeVisible({ timeout: 20_000 });
}

/**
 * Login, then open the embedded Wire workbench and wait for its folder rail.
 * Scoped to `button.mail-folder` because a pending message row carries the same
 * label text.
 */
export async function loginAndOpenWire(page: Page): Promise<void> {
  await loginConsole(page);
  await page.goto("/wire/");
  await expect(page.locator("button.mail-folder").filter({ hasText: "承認待ち" })).toBeVisible({
    timeout: 20_000,
  });
}
