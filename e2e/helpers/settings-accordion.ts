import { expect, type Page } from "@playwright/test";

export async function expandSettingsSection(page: Page, title: string): Promise<void> {
  const item = page.locator("details.settings-accordion-item").filter({
    has: page.getByRole("heading", { name: title, exact: true }),
  });
  await expect(item).toBeVisible({ timeout: 15_000 });
  if ((await item.getAttribute("open")) === null) {
    await item.locator(":scope > summary").click();
  }
  await expect(item).toHaveAttribute("open", "");
}
