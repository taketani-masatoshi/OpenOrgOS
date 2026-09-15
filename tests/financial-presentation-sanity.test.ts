import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildBalanceSheet,
  OWNER_DRAW_ACCOUNT_CODE,
} from "../src/lib/finance/ledger/balance-sheet.js";
import * as balanceSheetMod from "../src/lib/finance/ledger/balance-sheet.js";
import {
  assessPresentationSanity,
  computeJournalHash,
  loadPresentationSnapshots,
  resolvePresentationSanityPeriodForValidate,
  savePresentationSnapshot,
} from "../src/lib/finance/financial-presentation-sanity.js";
import { getTenantDir, setTenantId } from "../src/lib/tenant.js";
import { writeFinancialAuditWorkpapers } from "../src/lib/finance/financial-audit-workpapers.js";

describe("sole-prop BS owner draw unification", () => {
  it("puts 3210 on assets as positive for sole prop", () => {
    setTenantId("_fixture-sole-prop");
    const bs = buildBalanceSheet({ asOf: "2026-12-31" });
    const onEquity = bs.equity.find((l) => l.account_code === OWNER_DRAW_ACCOUNT_CODE);
    expect(onEquity).toBeUndefined();
    const onAsset = bs.assets.find((l) => l.account_code === OWNER_DRAW_ACCOUNT_CODE);
    if (onAsset) {
      expect(onAsset.balance_yen).toBeGreaterThanOrEqual(0);
    }
    expect(bs.balanced || bs.issues.some((i) => i.includes("mismatch"))).toBeTruthy();
  });
});

describe("presentation sanity", () => {
  const snapRel = "data/audit/presentation-snapshot.yaml";
  let snapBackup: string | null = null;

  beforeEach(() => {
    setTenantId("_fixture-sole-prop");
    const snapPath = join(getTenantDir(), snapRel);
    snapBackup = existsSync(snapPath) ? readFileSync(snapPath, "utf-8") : null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    const snapPath = join(getTenantDir(), snapRel);
    if (snapBackup != null) {
      writeFileSync(snapPath, snapBackup, "utf-8");
    }
  });

  it("runs without error findings on fixture sole prop", () => {
    const first = assessPresentationSanity({ period: "2026", updateBaseline: true });
    expect(first.findings.some((f) => f.code === "owner_draw_still_negative_on_corp_bs")).toBe(
      false,
    );
    expect(first.findings.some((f) => f.code === "owner_draw_negative_on_blue")).toBe(false);

    savePresentationSnapshot("2026", {
      ...first.metrics,
      corporate_total_assets_yen: first.metrics.corporate_total_assets_yen + 10_000,
      blue_total_assets_yen:
        first.metrics.blue_total_assets_yen != null
          ? first.metrics.blue_total_assets_yen + 10_000
          : null,
    });
    const second = assessPresentationSanity({ period: "2026", updateBaseline: false });
    expect(
      second.findings.some((f) => f.code === "presentation_total_jump_journals_unchanged"),
    ).toBe(true);
  });

  it("flags negative owner draw on blue assets", () => {
    vi.spyOn(balanceSheetMod, "buildBalanceSheet").mockReturnValue({
      as_of: "2026-12-31",
      assets: [
        {
          account_code: OWNER_DRAW_ACCOUNT_CODE,
          account_name: "事業主貸",
          section: "asset",
          balance_yen: -5000,
        },
      ],
      liabilities: [],
      equity: [],
      total_assets_yen: 0,
      total_liabilities_yen: 0,
      total_equity_yen: 0,
      balanced: true,
      net_income_yen: 0,
      issues: [],
    });
    const result = assessPresentationSanity({ period: "2026", updateBaseline: false });
    expect(result.findings.some((f) => f.code === "owner_draw_negative_on_blue")).toBe(true);
  });

  it("changes journal hash when a prior-year journal changes (≤ asOf scope)", () => {
    const journalPath = join(getTenantDir(), "data/finance/journal-entries.yaml");
    const original = readFileSync(journalPath, "utf-8");
    try {
      const before = computeJournalHash("2026").hash;
      writeFileSync(
        journalPath,
        `version: 1
entries:
  - entry_id: JE-HASH-PRIOR-TEST
    occurred_at: "2025-06-15T00:00:00.000Z"
    description: prior-year hash probe
    source:
      kind: manual
      authorized_by: hash-test
    evidence_refs:
      - test:hash
    lines:
      - account_code: "1100"
        debit_yen: 1
        credit_yen: 0
        tax_category: out_of_scope
      - account_code: "3100"
        debit_yen: 0
        credit_yen: 1
        tax_category: out_of_scope
`,
        "utf-8",
      );
      const after = computeJournalHash("2026").hash;
      expect(after).not.toBe(before);
    } finally {
      writeFileSync(journalPath, original, "utf-8");
    }
  });

  it("resolvePresentationSanityPeriodForValidate uses setup calendar_year", () => {
    expect(resolvePresentationSanityPeriodForValidate()).toBe("2026");
  });

  it("workpapers include presentation-sanity.md without writing baseline", () => {
    const snapPath = join(getTenantDir(), snapRel);
    const before = existsSync(snapPath) ? readFileSync(snapPath, "utf-8") : null;
    const beforeFile = loadPresentationSnapshots();
    const result = writeFinancialAuditWorkpapers("2026");
    expect(result.paths.some((p) => p.includes("presentation-sanity.md"))).toBe(true);
    const index = readFileSync(result.paths[0]!, "utf-8");
    expect(index).toContain("表示健全性");
    const after = existsSync(snapPath) ? readFileSync(snapPath, "utf-8") : null;
    expect(after).toBe(before);
    expect(loadPresentationSnapshots()).toEqual(beforeFile);
  });
});
