import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ConsumptionTaxReturnMap } from "../schemas/finance/consumption-tax-return-map.js";
import {
  consumptionTaxConsiderationYen,
  fiscalYearMonths,
  loadConsumptionTaxReturnMap,
  projectConsumptionTaxReturnRows,
  sumConsumptionTaxReturnBases,
  type ConsumptionTaxPurchaseContext,
  type ConsumptionTaxReturnBases,
} from "../src/lib/finance/consumption-tax-return-rows.js";

const REQUIRED_ROW_IDS = [
  "schedule_1_3_base_8",
  "schedule_1_3_base_10",
  "schedule_1_3_tax_8",
  "schedule_1_3_tax_10",
  "schedule_2_3_credit",
  "schedule_1_3_credit",
  "schedule_1_3_11",
  "schedule_1_3_13",
  "return_page2_base_8",
  "return_page2_base_10",
  "return_page2_base",
  "return_page1_1",
  "return_page1_2",
  "return_page1_3",
  "return_page1_4",
  "return_page1_5",
  "return_page1_6",
  "return_page1_7",
  "return_page1_9",
  "return_page1_10",
  "return_page1_11",
  "return_page1_18",
  "return_page1_20",
] as const;

const NONE_FACTS = {
  excess_adjustment_yen: 0,
  return_tax_yen: 0,
  bad_debt_yen: 0,
  interim_payment_yen: 0,
} as const;

const FULL_BASES: ConsumptionTaxReturnBases = {
  taxable_sales_10_yen: 1_234_567,
  taxable_sales_8_yen: 890_123,
  ...NONE_FACTS,
};

const FULL_PURCHASES: ConsumptionTaxPurchaseContext = {
  ratio: { taxable_yen: 10000, total_yen: 10000 },
  lines: [
    {
      occurred_on: "2026-04-01",
      tax_category: "taxable_10",
      base_yen: 200_000,
      invoice_status: "qualified",
      purchase_use: "taxable_only",
    },
    {
      occurred_on: "2026-04-01",
      tax_category: "taxable_8",
      base_yen: 50_000,
      invoice_status: "qualified",
      purchase_use: "taxable_only",
    },
  ],
};

function amount(rows: { id: string; amount_yen: number | null }[], id: string): number | null {
  const row = rows.find((candidate) => candidate.id === id);
  expect(row, id).toBeDefined();
  return row?.amount_yen ?? null;
}

describe("consumption tax return row mapping", () => {
  const mapping = loadConsumptionTaxReturnMap();

  it("loads the corporate standard return map without an e-Tax procedure", () => {
    const text = readFileSync(
      new URL(
        "../steward/jurisdiction-packs/JP/modules/jp_tax_consumption/spec/return-form-mapping.yaml",
        import.meta.url
      ),
      "utf8"
    );
    expect(mapping.submission).toBe("not-for-etax");
    expect(mapping.form).toBe("法人・本則・割戻し・一般用");
    expect(mapping.source_label).toContain("令和7年11月");
    expect(text).not.toMatch(/^\s*(procedure_id|xsd_path|xtx):/im);
    expect(Object.keys(mapping)).not.toContain("procedure_id");
    expect(mapping.disclaimer).toContain("提出しない");
    for (const id of REQUIRED_ROW_IDS) {
      expect(mapping.rows.find((row) => row.id === id)?.required).toBe(true);
    }
    expect(mapping.rows.find((row) => row.id === "return_page1_1")?.source).toEqual({
      kind: "row",
      id: "return_page2_base",
    });
    expect(mapping.rows.find((row) => row.id === "schedule_1_3_13")?.transform).toEqual({
      op: "signed_rate_then_payable_floor",
      numerator: 22,
      denominator: 78,
      payable_unit_yen: 100,
    });
    expect(mapping.rows.find((row) => row.id === "return_page1_20")?.transform).toEqual({
      op: "identity",
    });
    expect(mapping.rows.some((row) => row.line.includes("差引前"))).toBe(false);
  });

  it("fills every required row from separate 10% and 8% bases", () => {
    const result = projectConsumptionTaxReturnRows({
      bases: FULL_BASES,
      purchases: FULL_PURCHASES,
      mapping,
    });
    expect(result.submission).toBe("not-for-etax");
    expect(result.status).toBe("ready_for_advisor_review");
    for (const id of REQUIRED_ROW_IDS) {
      const row = result.rows.find((candidate) => candidate.id === id);
      expect(row?.row_status, id).toBe("filled");
      expect(row?.amount_yen, id).not.toBeNull();
    }
    expect(result.rows.some((row) => row.line.includes("差引前"))).toBe(false);
    expect(amount(result.rows, "return_page2_base_10")).toBe(1_234_000);
    expect(amount(result.rows, "return_page2_base_8")).toBe(890_000);
    expect(amount(result.rows, "schedule_1_3_base_10")).toBe(1_234_566);
    expect(amount(result.rows, "schedule_1_3_base_8")).toBe(890_122);
    expect(amount(result.rows, "schedule_1_3_standard_10")).toBe(1_234_000);
    expect(amount(result.rows, "schedule_1_3_standard_8")).toBe(890_000);
    expect(amount(result.rows, "return_page1_1")).toBe(1_234_000 + 890_000);
    expect(amount(result.rows, "schedule_1_3_tax_10")).toBe(96_252);
    expect(amount(result.rows, "schedule_1_3_tax_8")).toBe(55_536);
    expect(amount(result.rows, "schedule_1_3_tax_10")).not.toBe(123_400);
  });

  it("transfers purchase credit and taxable bases along the mapping chain", () => {
    const result = projectConsumptionTaxReturnRows({
      bases: FULL_BASES,
      purchases: FULL_PURCHASES,
      mapping,
    });
    const deductible = amount(result.rows, "schedule_2_3_credit");
    expect(deductible).toBe(18_720);
    expect(amount(result.rows, "schedule_1_3_credit")).toBe(deductible);
    expect(amount(result.rows, "return_page1_4")).toBe(deductible);
    expect(amount(result.rows, "return_page1_1")).toBe(
      (amount(result.rows, "return_page2_base_10") ?? 0) +
        (amount(result.rows, "return_page2_base_8") ?? 0)
    );
    expect(amount(result.rows, "return_page1_2")).toBe(96_252 + 55_536);
    expect(amount(result.rows, "return_page1_9")).toBe(133_000);
    expect(amount(result.rows, "return_page1_7")).toBe(deductible);
    expect(amount(result.rows, "return_page1_3")).toBe(0);
    expect(amount(result.rows, "return_page1_11")).toBe(133_000);
    expect(amount(result.rows, "schedule_1_3_11")).toBe(133_000);
    expect(amount(result.rows, "return_page1_18")).toBe(133_000);
    expect(amount(result.rows, "schedule_1_3_13")).toBe(37_500);
    expect(amount(result.rows, "return_page1_20")).toBe(37_500);
  });

  it("floors each rate to 1,000 yen before summing", () => {
    const result = projectConsumptionTaxReturnRows({
      mapping,
      bases: {
        taxable_sales_10_yen: 1_500,
        taxable_sales_8_yen: 1_500,
      },
      purchases: { lines: [] },
    });
    expect(amount(result.rows, "return_page2_base_10")).toBe(1_000);
    expect(amount(result.rows, "return_page2_base_8")).toBe(1_000);
    expect(amount(result.rows, "return_page1_1")).toBe(2_000);
    expect(amount(result.rows, "return_page1_1")).not.toBe(3_000);
    expect(amount(result.rows, "schedule_1_3_tax_10")).toBe(78);
    expect(amount(result.rows, "schedule_1_3_tax_10")).not.toBe(117);
    expect(amount(result.rows, "schedule_1_3_tax_8")).toBe(62);
  });

  it("matches the November 2025 writing-guide yen and does not floor ①-1 to thousands", () => {
    const consideration8 = consumptionTaxConsiderationYen(203_878_000, 100, 108);
    const consideration10 = consumptionTaxConsiderationYen(135_400_000, 100, 110);
    expect(consideration8).toBe(188_775_925);
    expect(consideration10).toBe(123_090_909);
    expect(consideration8 + consideration10).toBe(311_866_834);
    const standard8 = Math.floor(consideration8 / 1000) * 1000;
    const standard10 = Math.floor(consideration10 / 1000) * 1000;
    expect(standard8).toBe(188_775_000);
    expect(standard10).toBe(123_090_000);
    expect(standard8 + standard10).toBe(311_865_000);
    expect(Math.floor((standard8 * 624) / 10_000)).toBe(11_779_560);
    expect(Math.floor((standard10 * 78) / 1000)).toBe(9_601_020);
    expect(11_779_560 + 9_601_020).toBe(21_380_580);

    const result = projectConsumptionTaxReturnRows({
      mapping,
      bases: {
        taxable_sales_10_yen: 1_234_567,
        taxable_sales_8_yen: 890_123,
        ...NONE_FACTS,
      },
      purchases: { lines: [] },
    });
    expect(amount(result.rows, "schedule_1_3_base_10")).toBe(1_234_566);
    expect(amount(result.rows, "schedule_1_3_standard_10")).toBe(1_234_000);
    expect(amount(result.rows, "schedule_1_3_base_10")).not.toBe(
      amount(result.rows, "schedule_1_3_standard_10")
    );
  });

  it("does not hundred-floor a refund", () => {
    const result = projectConsumptionTaxReturnRows({
      mapping,
      bases: {
        taxable_sales_10_yen: 1_000,
        taxable_sales_8_yen: 0,
        ...NONE_FACTS,
      },
      purchases: {
        ratio: { taxable_yen: 10000, total_yen: 10000 },
        lines: [
          {
            occurred_on: "2026-04-01",
            tax_category: "taxable_10",
            base_yen: 10_000,
            invoice_status: "qualified",
            purchase_use: "taxable_only",
          },
        ],
      },
    });
    expect(amount(result.rows, "return_page1_9")).toBe(-702);
    expect(amount(result.rows, "return_page1_20")).toBe(-198);
  });

  it("blocks missing bases instead of completing them as zero", () => {
    const result = projectConsumptionTaxReturnRows({
      mapping,
      bases: {
        taxable_sales_10_yen: 1_500,
      },
      purchases: { lines: [] },
    });
    expect(result.status).toBe("blocked");
    expect(amount(result.rows, "return_page2_base_8")).toBeNull();
    expect(amount(result.rows, "return_page1_1")).toBeNull();
    expect(result.rows.find((row) => row.id === "return_page2_base_8")?.row_status).toBe("blocked");
    expect(amount(result.rows, "return_page2_base_10")).toBe(1_000);
  });

  it("does not treat a missing adjustment fact as zero", () => {
    const result = projectConsumptionTaxReturnRows({
      mapping,
      bases: {
        taxable_sales_10_yen: 1_500,
        taxable_sales_8_yen: 1_500,
      },
      purchases: { lines: [] },
    });
    expect(result.status).toBe("blocked");
    expect(amount(result.rows, "return_page1_3")).toBeNull();
    expect(result.rows.find((row) => row.id === "return_page1_3")?.row_status).toBe("blocked");
  });

  it("treats explicit not-applicable adjustment facts as zero", () => {
    const sales = {
      taxable_sales_10_yen: 1_500,
      taxable_sales_8_yen: 1_500,
    };
    const explicitZero = projectConsumptionTaxReturnRows({
      mapping,
      bases: { ...sales, ...NONE_FACTS },
      purchases: { lines: [] },
    });
    const notApplicable = projectConsumptionTaxReturnRows({
      mapping,
      bases: {
        ...sales,
        excess_adjustment_yen: "該当なし",
        return_tax_yen: "該当なし",
        bad_debt_yen: "該当なし",
        interim_payment_yen: "該当なし",
      },
      purchases: { lines: [] },
    });
    expect(notApplicable.status).toBe("ready_for_advisor_review");
    expect(amount(notApplicable.rows, "return_page1_3")).toBe(0);
    for (const id of [
      "return_page1_7",
      "return_page1_9",
      "return_page1_11",
      "return_page1_18",
      "return_page1_20",
    ]) {
      expect(amount(notApplicable.rows, id), id).toBe(amount(explicitZero.rows, id));
    }
  });

  it("does not fill return rows for simplified tax", () => {
    const result = projectConsumptionTaxReturnRows({
      mapping,
      method: "simplified",
      bases: FULL_BASES,
    });
    expect(result.status).toBe("blocked");
    expect(amount(result.rows, "return_page1_1")).toBeNull();
    expect(amount(result.rows, "return_page1_9")).toBeNull();
  });

  it("fails the transfer check when a mapped row is pointed at the wrong source", () => {
    const broken: ConsumptionTaxReturnMap = {
      ...mapping,
      rows: mapping.rows.map((row) =>
        row.id === "return_page1_4"
          ? { ...row, source: { kind: "row", id: "return_page1_2" } }
          : row
      ),
    };
    const shifted = projectConsumptionTaxReturnRows({
      bases: FULL_BASES,
      purchases: FULL_PURCHASES,
      mapping: broken,
    });
    expect(amount(shifted.rows, "return_page1_4")).not.toBe(
      amount(shifted.rows, "schedule_2_3_credit")
    );
  });

  it("sums only matching summary lines and lists fiscal months", () => {
    const summed = sumConsumptionTaxReturnBases([
      {
        method: "standard",
        lines: [
          { tax_category: "taxable_10", base_yen: 100, direction: "sales" },
          { tax_category: "taxable_8", base_yen: 40, direction: "sales" },
        ],
      },
      {
        method: "standard",
        lines: [
          { tax_category: "taxable_10", base_yen: 5, direction: "purchase" },
          { tax_category: "exempt", base_yen: 9, direction: "sales" },
        ],
      },
    ]);
    expect(summed).toEqual({
      method: "standard",
      bases: {
        taxable_sales_10_yen: 100,
        taxable_sales_8_yen: 40,
        taxable_purchases_10_yen: 5,
        taxable_purchases_8_yen: 0,
      },
    });
    expect(sumConsumptionTaxReturnBases([{ method: "simplified", lines: [] }]).method).toBe(
      "simplified"
    );
    expect(fiscalYearMonths("FY2026", 12)).toHaveLength(12);
    expect(fiscalYearMonths("FY2026", 12)[0]).toBe("2026-01");
    expect(fiscalYearMonths("FY2026", 3)[0]).toBe("2026-04");
    expect(fiscalYearMonths("FY2026", 3).at(-1)).toBe("2027-03");
  });

  it("does not import monthly close, corporate tax XML, tax adjustment, or eltax", () => {
    const source = readFileSync(
      new URL("../src/lib/finance/consumption-tax-return-rows.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(/monthly-close|jp-corporate-tax-xml|tax-adjustment|eltax/);
    expect(source).not.toMatch(/①|22\s*\/\s*78|7\.8|6\.24/);
  });
});
