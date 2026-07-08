import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Dev passkey").fill("orgos-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
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

  test("shows KPI and wire console link on combined origin", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("heading", { name: "KPI" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Wire Console →" })).toBeVisible();
  });

  test("approves wire pending with shared session", async ({ page }) => {
    await login(page);

    const statsBefore = await page.locator(".stats").textContent();
    const countBefore = Number(statsBefore?.match(/Wire:\s*(\d+)/)?.[1] ?? "0");
    expect(countBefore).toBeGreaterThan(0);

    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/chat/v1/approvals/") &&
          r.url().endsWith("/approve") &&
          r.request().method() === "POST"
      ),
      page.getByRole("button", { name: "承認" }).first().click(),
    ]);

    await expect
      .poll(async () => {
        const text = await page.locator(".stats").textContent();
        return Number(text?.match(/Wire:\s*(\d+)/)?.[1] ?? "0");
      })
      .toBeLessThan(countBefore);
  });
});
