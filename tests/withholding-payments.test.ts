import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPaymentSlipsDraft,
  computeRewardFeeWithholdingYen,
  computeWithholdingYen,
  writeWithholdingPaymentJournalDrafts,
} from "../src/lib/finance/withholding-payments.js";
import { getTenantDir, setTenantId } from "../src/lib/tenant.js";

const TENANT = "_fixture-sole-prop";

describe("withholding payments (reward/fee)", () => {
  beforeEach(() => {
    setTenantId(TENANT);
    writeFileSync(
      join(getTenantDir(), "data/finance/withholding-payments.yaml"),
      `version: 1
calendar_year: 2026
payments:
  - payment_id: WP-2026-001
    payee_name: 外注太郎
    category: reward_fee
    paid_at: "2026-06-15"
    gross_yen: 1000000
    expense_account_code: "5100"
`,
      "utf-8",
    );
  });

  afterEach(() => {
    writeFileSync(
      join(getTenantDir(), "data/finance/withholding-payments.yaml"),
      "version: 1\ncalendar_year: 2026\npayments: []\n",
      "utf-8",
    );
  });

  it("computes statutory-ish rate on 1M yen", () => {
    expect(computeWithholdingYen(1_000_000, 10.21)).toBe(102_100);
    expect(computeRewardFeeWithholdingYen(1_000_000)).toBe(102_100);
  });

  it("applies progressive 20.42% above 1M", () => {
    // 1_000_000 * 10.21% + 500_000 * 20.42%
    expect(computeRewardFeeWithholdingYen(1_500_000)).toBe(102_100 + 102_100);
  });

  it("builds payment slips and journal drafts", () => {
    const slips = buildPaymentSlipsDraft(2026);
    expect(slips.total_gross).toBe(1_000_000);
    expect(slips.total_withholding).toBe(102_100);
    expect(slips.rows[0]?.payee_name).toBe("外注太郎");

    const journals = writeWithholdingPaymentJournalDrafts(2026);
    expect(journals.count).toBe(1);
    expect(journals.paths[0]).toContain("WP-2026-001");
  });
});
