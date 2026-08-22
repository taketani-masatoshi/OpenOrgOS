import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  // Codex 予実 login gate
  const pass = page.getByLabel("パスワード（dev passkey）");
  if (await pass.count()) {
    await pass.fill("orgos-dev");
    await page.getByRole("button", { name: "ログイン" }).click();
  } else {
    await page.getByLabel("Dev passkey").fill("orgos-dev");
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("operator console combined", () => {
  test("health reports combined service with both SPAs", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as {
      service: string;
      wire_spa: boolean;
      chat_spa: boolean;
    };
    expect(body.service).toBe("operator-console");
    expect(body.wire_spa).toBe(true);
    expect(body.chat_spa).toBe(true);
  });

  test("shared session between chat and wire console API", async ({ page, request }) => {
    await login(page);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const me = await request.get("/console/v1/auth/me", {
      headers: { cookie: cookieHeader },
    });
    expect(me.ok()).toBeTruthy();
    const body = (await me.json()) as { ok: boolean; user: { operator_id: string } };
    expect(body.ok).toBe(true);
    expect(body.user.operator_id).toBeTruthy();
  });

  test("wire console SPA loads at /wire/", async ({ page }) => {
    await page.goto("/wire/");
    await expect(page.locator("#root")).toBeVisible();
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("shows 予実 shell and wire console link on combined origin", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "Wire" })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "予実" })
    ).toHaveAttribute("aria-current", "page");
  });

  test("approves wire pending with shared session", async ({ page }) => {
    await login(page);
    await page.goto("/wire/");
    await expect(page.getByRole("button", { name: "承認待ち" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "承認待ち" }).click();

    const pendingRow = page.locator(".message-row").filter({ hasText: "承認待ち" }).first();
    await expect(pendingRow).toBeVisible({ timeout: 15_000 });
    const countBefore = await page.locator(".message-row").filter({ hasText: "承認待ち" }).count();
    expect(countBefore).toBeGreaterThan(0);

    await Promise.all([
      page.waitForResponse(
        (r) =>
          (r.url().includes("/chat/v1/approvals/") || r.url().includes("/console/v1/")) &&
          r.url().includes("approve") &&
          r.request().method() === "POST"
      ),
      pendingRow.click().then(async () => {
        await page.getByRole("button", { name: "承認" }).click();
      }),
    ]);

    await expect
      .poll(async () => page.locator(".message-row").filter({ hasText: "承認待ち" }).count())
      .toBeLessThan(countBefore);
  });
});
