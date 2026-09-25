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

    await expect(page.getByLabel("OIDC トークン")).toBeVisible();
    await page.getByLabel("OIDC トークン").fill(fixture.id_token);
    await page.getByLabel("オペレーター").fill(fixture.operator_id);
    await page.getByLabel("承認者").fill(fixture.approver_id);
    await page.getByRole("button", { name: "入る", exact: true }).click();

    await expect(page.getByRole("link", { name: "相手組織", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
      { timeout: 15_000 }
    );
    await expect(page.getByText(/E2E OIDC/)).toBeVisible();
    await expect(page.getByText(/approver テスト承認者/)).toBeVisible();
  });
});
