import { expect, test } from "@playwright/test";
import { expandSettingsSection } from "./helpers/settings-accordion";

async function login(page: import("@playwright/test").Page): Promise<void> {
  const sendLogin = () =>
    page.request.post("/chat/v1/auth/login", {
      data: { passkey: "orgos-dev", operator_id: "OP-001", approver_id: "OP-001" },
    });
  let loginResponse;
  try {
    loginResponse = await sendLogin();
  } catch {
    loginResponse = await sendLogin();
  }
  expect(loginResponse.ok(), await loginResponse.text()).toBeTruthy();
  await page.goto("/");
  const shell = page.getByRole("navigation", { name: "Operator Console" });
  await expect(shell).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("operator console combined", () => {
  test("health reports combined service with unified SPA", async ({ request }) => {
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

  test("shows stable task-oriented navigation on combined origin", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "連携" })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "経営" })
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "財務" })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "業務" })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "組織" })
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Operator Console" })
        .getByRole("link", { name: "AIチーム" })
    ).toBeVisible();
  });

  test("tab switch between ledger and wire avoids full reload and auth refetch", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
      timeout: 15_000,
    });

    const navEntriesBefore = await page.evaluate(
      () => performance.getEntriesByType("navigation").length
    );

    let authMeCount = 0;
    const onAuthMe = (req: import("@playwright/test").Request) => {
      if (req.url().includes("/chat/v1/auth/me") && req.method() === "GET") {
        authMeCount += 1;
      }
    };
    page.on("request", onAuthMe);

    await page
      .getByRole("navigation", { name: "Operator Console" })
      .getByRole("link", { name: "連携" })
      .click();
    await page.waitForURL("**/wire/**");
    await expect(page.getByRole("button", { name: "承認待ち" })).toBeVisible({
      timeout: 15_000,
    });

    const navEntriesAfterWire = await page.evaluate(
      () => performance.getEntriesByType("navigation").length
    );
    expect(navEntriesAfterWire).toBe(navEntriesBefore);

    const authMeBeforeLedger = authMeCount;
    await page
      .getByRole("navigation", { name: "Operator Console" })
      .getByRole("link", { name: "財務" })
      .click();
    await expect(page).toHaveURL(/ledger=1/);
    expect(authMeCount).toBe(authMeBeforeLedger);

    page.off("request", onAuthMe);
  });

  test("direct /wire/ loads wire workbench in the same SPA shell", async ({ page }) => {
    await login(page);
    await page.goto("/wire/");
    await expect(page.getByRole("navigation", { name: "Operator Console" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "承認待ち" })).toBeVisible({
      timeout: 15_000,
    });
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

  test("org chart shows company units as a table", async ({ page }) => {
    await login(page);
    await page.goto("/org/");
    await expect(page.getByRole("heading", { name: /株式会社MAL|組織/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("取締役会").first()).toBeVisible();
    await expect(page.getByText("段燕燕").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "ユーザー" })).toBeVisible();
    await expect(page.getByLabel("表示する時点")).toBeVisible();
    await expect(page.getByRole("heading", { name: "組織図", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "稼働中のエージェント" })).toHaveCount(0);
    await page.getByText("段燕燕", { exact: true }).first().click();
    await expect(page.getByText("ログインID").first()).toBeVisible();
    await expect(page.getByText("ログイン PassKey").first()).toBeVisible();
  });

  test("agent inventory is operational and additions live in settings", async ({ page }) => {
    await login(page);
    await page
      .getByRole("navigation", { name: "Operator Console" })
      .getByRole("link", { name: "AIチーム" })
      .click();
    await page
      .getByRole("navigation", { name: "AIチームメニュー" })
      .getByRole("link", { name: "エージェント一覧" })
      .click();
    await expect(page.getByRole("heading", { name: "エージェント一覧" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: "エージェント追加" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "取り込み済みモジュール" })).toHaveCount(0);
    await page.getByRole("link", { name: "設定" }).click();
    await page
      .getByRole("navigation", { name: "設定メニュー" })
      .getByRole("link", { name: "モジュール管理" })
      .click();
    await expect(page.getByRole("heading", { name: "モジュール一覧" })).toBeVisible();
    await page.getByRole("link", { name: "モジュール追加" }).click();
    await expect(page.getByRole("heading", { name: "モジュール追加" })).toBeVisible();
  });

  test("settings defaults to Japanese and offers PassKey issuance", async ({ page }) => {
    await login(page);
    await page.goto("/settings/");
    await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "言語" })).toBeVisible();
    await expect(page.getByLabel("表示言語")).toBeHidden();
    await expandSettingsSection(page, "言語");
    await expect(page.getByLabel("表示言語")).toHaveValue("ja");
    await expandSettingsSection(page, "ログイン PassKey");
    await expect(page.getByText("Touch ID でコンソールに入り直す鍵です。")).toBeVisible();
  });

  test("login screen offers Touch ID after a login PassKey exists", async ({ page, request }) => {
    await login(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const cfg = await request.get("/chat/v1/auth/config", {
      headers: { cookie: cookieHeader },
    });
    const body = (await cfg.json()) as { webauthn?: { credential_count?: number } };
    await page.getByRole("button", { name: "サインアウト" }).click();
    await expect(page.getByRole("heading", { name: "オペレーター認証" })).toBeVisible({
      timeout: 15_000,
    });
    if ((body.webauthn?.credential_count ?? 0) > 0) {
      await expect(page.getByRole("button", { name: "Touch ID で入る" })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "入る", exact: true })).toBeVisible();
  });
});
