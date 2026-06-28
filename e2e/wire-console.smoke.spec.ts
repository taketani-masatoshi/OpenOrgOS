import { expect, test } from "@playwright/test";

test.describe("wire console smoke", () => {
  test("login, tenant tab, propose, approve, flush delivery, witness register and verify", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("Dev passkey").fill("orgos-dev");
    await page.getByLabel("Approver").fill("テスト承認者");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: "Wire Console" })).toBeVisible();
    await page.getByRole("button", { name: "wire-console-test" }).click();
    await expect(page.getByText("Propose notice")).toBeVisible({ timeout: 15_000 });

    const proposePanel = page.locator("section.panel").filter({ hasText: "Propose notice" });
    await proposePanel.locator("label").filter({ hasText: "peer" }).locator("select").selectOption("PEER-001");
    await proposePanel.getByPlaceholder("CTR-012").fill("CTR-099");
    await proposePanel.getByRole("button", { name: "Propose" }).click();

    await expect(proposePanel.getByText(/Created NOTICE-/)).toBeVisible({ timeout: 10_000 });

    const approvalsPanel = page.locator("section.panel").filter({ hasText: "Wire approvals" });
    await expect(approvalsPanel.getByText("pending_approval")).toBeVisible({ timeout: 10_000 });
    await approvalsPanel.getByRole("button", { name: "Approve" }).first().click();
    await expect(approvalsPanel.getByText("pending_approval")).not.toBeVisible({ timeout: 15_000 });
    await expect(approvalsPanel.getByText("transmitted")).toBeVisible({ timeout: 15_000 });

    const wireEventId = await approvalsPanel.locator("[data-wire-event-id]").getAttribute("data-wire-event-id");
    expect(wireEventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

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
