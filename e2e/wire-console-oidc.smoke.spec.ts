import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

interface OidcSmokeFixture {
  id_token: string;
  operator_id: string;
  approver_id: string;
}

function loadOidcSmokeFixture(): OidcSmokeFixture {
  return JSON.parse(
    readFileSync(join(process.cwd(), ".orgos/wire-console-oidc-smoke.json"), "utf-8")
  ) as OidcSmokeFixture;
}

test.describe("wire console oidc smoke", () => {
  test("prod OIDC id_token login via SPA form (RS256 + JWKS)", async ({ page }) => {
    const fixture = loadOidcSmokeFixture();
    await page.goto("/");

    await expect(page.getByLabel("OIDC id_token")).toBeVisible();
    await page.getByLabel("OIDC id_token").fill(fixture.id_token);
    await page.getByLabel("Operator").fill(fixture.operator_id);
    await page.getByLabel("Approver").fill(fixture.approver_id);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("heading", { name: "Wire Console" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/E2E OIDC/)).toBeVisible();
    await expect(page.getByText(/approver テスト承認者/)).toBeVisible();
  });
});
