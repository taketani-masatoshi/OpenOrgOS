import { expect, test } from "@playwright/test";
import { loginConsole } from "./helpers/console-login";
import { loginApi } from "./helpers/api-login";

/** Outbound correspondence: the gate, the ship gate, and secret handling. */
test.describe("steward chat mail", () => {
  test("mail settings are reachable from company setup", async ({ page }) => {
    await loginConsole(page);
    await page.goto("/?onboarding=1");
    await expect(page.getByRole("heading", { name: "メール" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Gmail と連携する" })).toBeVisible();
  });

  test("an unapproved draft cannot be sent", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/correspondence/DRAFT-NOT-REAL/send", {
      data: { dry_run: true },
    });
    expect(res.status()).toBe(400);
  });

  test("saved SMTP password is never echoed back", async ({ request }) => {
    await loginApi(request);
    const saved = await request.put("/chat/v1/mail/secrets", {
      data: { ORGOS_SMTP_USER: "bot@example.com", ORGOS_SMTP_PASSWORD: "e2e-secret-value" },
    });
    expect(saved.status(), await saved.text()).toBe(200);

    const status = await request.get("/chat/v1/mail/gmail");
    expect(status.status()).toBe(200);
    expect(await status.text()).not.toContain("e2e-secret-value");
  });

  test("Gmail connect stays behind the platform ship gate", async ({ request }) => {
    await loginApi(request);
    const res = await request.post("/chat/v1/mail/gmail/connect", { data: {} });
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { connect_url?: string; platform_ready?: boolean };
    // A connect URL is a handover to Community, not a shipped mailbox: the
    // response must say the platform is not ready rather than imply it is.
    expect(body.connect_url).toBeTruthy();
    expect(body.platform_ready).toBe(false);
  });
});
