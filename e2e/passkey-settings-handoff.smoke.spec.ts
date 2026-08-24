import { expect, test } from "@playwright/test";

const communityHandoffPattern = /\/ops\/console\/start\?next=/;

test.describe("passkey settings handoff (wire)", () => {
  test("unauthenticated /settings/ shows Community handoff", async ({ page }) => {
    await page.goto("/settings/");

    await expect(
      page.getByRole("heading", { name: "PassKey 設定の前に Community でログイン" }),
    ).toBeVisible({ timeout: 15_000 });

    const handoff = page.getByRole("link", { name: /Community で Google ログイン|Community で入る/ });
    await expect(handoff.first()).toBeVisible();
    await expect(handoff.first()).toHaveAttribute("href", communityHandoffPattern);

    const href = await handoff.first().getAttribute("href");
    expect(href).toContain(encodeURIComponent("/settings/"));
  });
});
