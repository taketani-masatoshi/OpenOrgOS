import { describe, expect, it } from "vitest";
import { backfillJournalTaxCategories } from "../src/lib/finance/journal-tax-backfill.js";

describe("journal tax backfill", () => {
  it("runs dry-run without throwing", () => {
    const result = backfillJournalTaxCategories({ dryRun: true });
    expect(result.dry_run).toBe(true);
    expect(result.updated_lines).toBeGreaterThanOrEqual(0);
  });
});
