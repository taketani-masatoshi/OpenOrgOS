import { expect, test, type Locator } from "@playwright/test";

import { loginConsole as login } from "./helpers/console-login";
import { LOCAL_MODELS, mockLlmRouteCatalog } from "./helpers/llm-route-mock";

async function expectLlmRoutePickerVisible(
  root: Locator,
  opts?: { forcedLocal?: boolean },
): Promise<void> {
  const picker = root.locator(".llm-route-picker-select");
  await expect(picker).toBeVisible();
  await expect(picker).toBeEnabled();
  await expect(picker.locator("option[value='local']")).toHaveCount(1);
  if (opts?.forcedLocal) {
    await expect(picker.locator("option[value='auto']")).toHaveCount(0);
    await expect(picker.locator("option[value='cloud']")).toHaveCount(0);
  } else {
    await expect(picker.locator("option[value='auto']")).toHaveCount(1);
    await expect(picker.locator("option[value='cloud']")).toHaveCount(1);
  }
  for (const model of LOCAL_MODELS) {
    await expect(picker.locator("option", { hasText: model })).toHaveCount(1);
  }
}

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

  test("予実 wallet is reachable from shell tab", async ({ page }) => {
    await login(page);
    await page
      .getByRole("navigation", { name: "Operator Console" })
      .getByRole("link", { name: "予実" })
      .click();
    await expect(page).toHaveURL(/wallet=1/, { timeout: 5_000 });
    await expect(
      page.getByRole("navigation", { name: "Operator Console" }).getByRole("link", { name: "予実" })
    ).toHaveAttribute("aria-current", "page");
  });

  test("秘書とスチュワードのチャットにWeb検索スイッチを表示する", async ({ page }) => {
    await mockLlmRouteCatalog(page);
    await login(page);

    await page.goto("/secretary/");
    const secretaryPane = page.locator(".agent-chat-pane").filter({
      has: page.locator("#agent-chat-input-secretary"),
    });
    await expect(page.locator("#agent-chat-input-secretary")).toBeVisible({
      timeout: 20_000,
    });
    await expect(secretaryPane.getByText("チャットから仕訳を提案")).toBeVisible();
    const secretarySwitch = secretaryPane.getByRole("switch", { name: /Web検索/ });
    await expect(secretarySwitch).toBeVisible();
    await expect(secretarySwitch).not.toBeChecked();
    await expect(page.locator("#agent-chat-input-secretary")).toHaveCount(1);
    await expectLlmRoutePickerVisible(secretaryPane);
    await secretarySwitch.check();
    await expect(secretarySwitch).toBeChecked();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(secretaryPane.getByText("入力内容を公開Web検索へ送信します")).toBeVisible();
    await expectLlmRoutePickerVisible(secretaryPane, { forcedLocal: true });

    await page.goto("/steward/");
    const stewardPane = page.locator(".agent-chat-pane").filter({
      has: page.locator("#agent-chat-input-executive_steward"),
    });
    await expect(page.locator("#agent-chat-input-executive_steward")).toBeVisible({
      timeout: 20_000,
    });
    await expect(stewardPane.getByText("チャットから仕訳を提案")).toBeVisible();
    const stewardSwitch = stewardPane.getByRole("switch", { name: /Web検索/ });
    await expect(stewardSwitch).toBeVisible();
    await expect(stewardSwitch).not.toBeChecked();
    await expectLlmRoutePickerVisible(stewardPane);
  });

  test("同じ入力欄をWeb検索スイッチで送信先へ振り分ける", async ({ page }) => {
    await mockLlmRouteCatalog(page);
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
