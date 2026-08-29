import { expect, test } from "@playwright/test";

test.describe("wire console smoke", () => {
  test("login, tenant tab, propose, approve, flush delivery, witness register and verify", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("Dev passkey").fill("orgos-dev");
    await page.getByLabel("Approver").fill("テスト承認者");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("link", { name: "Wire", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await page.getByRole("button", { name: "wire-console-test" }).click();
    await expect(page.getByRole("button", { name: "承認待ち" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "相手送信待ち" })).toBeVisible();
    await expect(page.getByRole("button", { name: "受信" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "送信", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "スレッド" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "新規作成" })).toBeVisible();

    await page.getByRole("button", { name: "新規作成" }).click();
    const composeDialog = page.getByRole("dialog", { name: "新規作成" });
    await composeDialog.getByLabel("宛先").selectOption("PEER-001");
    await composeDialog.getByLabel("契約 ID").fill("CTR-099");
    await composeDialog.getByRole("button", { name: "送信申請" }).click();

    await page.getByRole("button", { name: "承認待ち" }).click();
    await expect(page.getByText("承認待ち").first()).toBeVisible({ timeout: 10_000 });

    const pendingRow = page.locator(".message-row").filter({ hasText: "承認待ち" }).first();
    await pendingRow.click();
    await page.getByRole("button", { name: "承認" }).click();
    await expect(page.getByText("承認しました").or(page.getByText("送信済み"))).toBeVisible({
      timeout: 15_000,
    });

    const wireEventId = await page.locator("[data-wire-event-id]").first().getAttribute("data-wire-event-id");
    expect(wireEventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    await page.getByText("配送・公証（オペレータ向け）").click();
    const deliveryPanel = page.locator("section.panel").filter({ hasText: "Delivery" });
    await expect(deliveryPanel.getByText(/pending [1-9]/)).toBeVisible({ timeout: 15_000 });
    await deliveryPanel.getByRole("button", { name: "Flush pending" }).click();
    await expect(deliveryPanel.getByText(/Flushed \d+ pending/)).toBeVisible({ timeout: 15_000 });

    const witnessPanel = page.locator("section.panel").filter({ hasText: "Witness" });
    await expect(witnessPanel.getByText(/2 hub\(s\)/)).toBeVisible({ timeout: 10_000 });
    await witnessPanel.getByLabel("event_id").fill(wireEventId!);
    await witnessPanel.getByRole("button", { name: "Register attestation" }).click();
    await expect(witnessPanel.getByText(/Registered · quorum/)).toBeVisible({ timeout: 20_000 });

    await witnessPanel.getByLabel("side").selectOption("received");
    await witnessPanel.getByRole("button", { name: "Register attestation" }).click();
    await expect(witnessPanel.getByText(/quorum .* OK/)).toBeVisible({ timeout: 20_000 });

    await witnessPanel.getByRole("button", { name: "Verify event" }).click();
    await expect(witnessPanel.getByText(/receipt\(s\) · quorum .* OK/)).toBeVisible({ timeout: 20_000 });
  });
});
