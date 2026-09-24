import { expect, type Page } from "@playwright/test";

/**
 * Operator Console dev login. Idempotent: when the session cookie already
 * authenticates the browser context, the gate never renders and we return.
 *
 * Important: OperatorShell's nav is visible even while signed out (password
 * form inside the shell). Waiting for nav alone does not prove a session.
 */

async function waitForAuthGate(page: Page): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Operator Console" });
  const operator = page.locator("#orgos-login-operator");
  // Loading shell shows "読み込み中…" without the login field or nav.
  await expect(operator.or(nav).first()).toBeVisible({ timeout: 20_000 });
}

async function expectSignedIn(page: Page): Promise<void> {
  await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
    timeout: 20_000,
  });
  // Signed-out chrome still shows the nav; the password form must be gone.
  await expect(page.locator("#orgos-login-operator")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("未ログイン", { exact: true })).toHaveCount(0);
}

async function submitDevLogin(
  page: Page,
  operatorId: string,
  password: string,
): Promise<void> {
  const operator = page.locator("#orgos-login-operator");
  await operator.fill(operatorId);
  await page.locator("#orgos-login-password").fill(password);
  await page.locator("#orgos-login-submit").click();
  await expectSignedIn(page);
}

export async function loginConsole(
  page: Page,
  operatorId = "OP-001",
  password = "orgos-dev",
): Promise<void> {
  await page.goto("/");
  await waitForAuthGate(page);
  if (await page.locator("#orgos-login-operator").isVisible().catch(() => false)) {
    await submitDevLogin(page, operatorId, password);
    return;
  }
  await expectSignedIn(page);
}

/**
 * Navigate after loginConsole. Re-authenticates if the session cookie was
 * dropped (loopback Secure cookie edge cases, server restart, etc.).
 */
export async function gotoConsole(
  page: Page,
  path = "/",
  operatorId = "OP-001",
  password = "orgos-dev",
): Promise<void> {
  await page.goto(path);
  await waitForAuthGate(page);
  if (await page.locator("#orgos-login-operator").isVisible().catch(() => false)) {
    await submitDevLogin(page, operatorId, password);
    return;
  }
  await expectSignedIn(page);
}

/**
 * Login, then open the embedded Wire workbench and wait for its folder rail.
 * Scoped to `button.mail-folder` because a pending message row carries the same
 * label text.
 */
export async function loginAndOpenWire(page: Page): Promise<void> {
  await loginConsole(page);
  await gotoConsole(page, "/wire/");
  await expect(page.locator("button.mail-folder").filter({ hasText: "承認待ち" })).toBeVisible({
    timeout: 20_000,
  });
}
