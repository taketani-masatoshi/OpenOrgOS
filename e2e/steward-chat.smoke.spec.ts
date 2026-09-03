import { expect, test } from "@playwright/test";

import { loginConsole as login } from "./helpers/console-login";

test.describe("steward chat smoke", () => {
  test("ログイン中の表示は氏名だけにする", async ({ page }) => {
    await login(page);
    const label = page.locator(".ops-shell-operator");
    await expect(label).toHaveText("段燕燕");
    await expect(label).not.toContainText(/オペレータ|承認者|モード/);
  });

  test("login shows executive home by default without chat UI", async ({ page }) => {
    await login(page);

    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "経営" })
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "経営ダッシュボード" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "チャット" })).toHaveCount(0);
    await expect(page.getByPlaceholder("来週の支払いリスクは？")).toHaveCount(0);
  });

  test("個人予実 is reachable from the finance group", async ({ page }) => {
    await login(page);
    await page
      .getByRole("navigation", { name: "Operator Console" })
      .getByRole("link", { name: "財務" })
      .click();
    await expect(page).toHaveURL(/ledger=1/, { timeout: 5_000 });
    await page
      .getByRole("navigation", { name: "財務メニュー" })
      .getByRole("link", { name: "個人予実" })
      .click();
    await expect(page).toHaveURL(/wallet=1/, { timeout: 5_000 });
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "財務" })
    ).toHaveAttribute("aria-current", "page");
  });

  test("秘書とスチュワードのチャットにWeb検索スイッチを表示する", async ({ page }) => {
    await login(page);

    await page.goto("/secretary/");
    const secretarySwitch = page.getByRole("switch", { name: /Web検索/ });
    await expect(secretarySwitch).toBeVisible();
    await expect(secretarySwitch).not.toBeChecked();
    await secretarySwitch.check();
    await expect(secretarySwitch).toBeChecked();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByText("入力内容を公開Web検索へ送信します")).toBeVisible();
    await expect(page.locator("#agent-chat-input-secretary")).toHaveCount(1);
    const modelPicker = page.getByRole("combobox", { name: "LLM" });
    await expect(modelPicker).toBeEnabled();
    for (const model of ["qwen2.5:14b", "gemma4:12b", "gemma4:latest", "llama3.2:1b"]) {
      await expect(modelPicker.locator("option", { hasText: model })).toHaveCount(1);
    }

    await page.goto("/steward/");
    const stewardSwitch = page.getByRole("switch", { name: /Web検索/ });
    await expect(stewardSwitch).toBeVisible();
    await expect(stewardSwitch).not.toBeChecked();
  });

  test("同じ入力欄をWeb検索スイッチで送信先へ振り分ける", async ({ page }) => {
    await login(page);
    await page.goto("/secretary/");

    const payloads: Array<Record<string, unknown>> = [];
    await page.route("**/chat/v1/message/stream", async (route) => {
      payloads.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: [
          'data: {"type":"connected","thread_id":"e2e"}',
          "",
          'data: {"type":"done","ok":true,"reply":"確認しました。","thread_id":"e2e"}',
          "",
        ].join("\n"),
      });
    });

    const composer = page.locator("#agent-chat-input-secretary");
    await composer.fill("通常の相談です");
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await expect.poll(() => payloads.length).toBe(1);
    expect(payloads[0]?.web_search).toBe(false);
    expect(payloads[0]?.web_search_query).toBeUndefined();

    await page.getByRole("switch", { name: /Web検索/ }).check();
    await page.getByRole("combobox", { name: "LLM" }).selectOption({ label: "qwen2.5:14b" });
    await composer.fill("OpenOrgOS 最新情報");
    await page.getByRole("button", { name: "送信", exact: true }).click();
    await expect.poll(() => payloads.length).toBe(2);
    expect(payloads[1]?.web_search).toBe(true);
    expect(payloads[1]?.web_search_query).toBe("OpenOrgOS 最新情報");
    expect(payloads[1]?.llm_route).toEqual({
      mode: "local",
      worker_id: "local-01",
      model: "qwen2.5:14b",
    });
  });
});
