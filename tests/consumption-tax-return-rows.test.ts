import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ConsumptionTaxReturnMap } from "../schemas/finance/consumption-tax-return-map.js";
import {
  fiscalYearMonths,
  loadConsumptionTaxReturnMap,
  projectConsumptionTaxReturnRows,
  sumConsumptionTaxReturnBases,
  type ConsumptionTaxReturnBases,
} from "../src/lib/finance/consumption-tax-return-rows.js";

const REQUIRED_ROW_IDS = [
  "return_page2_base_10",
  "return_page2_base_8",
  "schedule_2_3_deductible",
  "schedule_1_3_base_10",
  "schedule_1_3_base_8",
  "schedule_1_3_national_output_10",
  "schedule_1_3_national_output_8",
  "schedule_1_3_input_credit",
  "return_page1_line_1",
  "return_page1_line_2",
  "return_page1_line_4",
  "return_page1_line_5",
  "return_page1_local",
] as const;

const FULL_BASES: ConsumptionTaxReturnBases = {
  taxable_sales_10_yen: 1_234_567,
  taxable_sales_8_yen: 890_123,
  taxable_purchases_10_yen: 200_000,
  taxable_purchases_8_yen: 50_000,
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
    expect(mapping.rows.find((row) => row.id === "return_page1_line_1")?.source).toEqual({
      kind: "rows",
      ids: ["return_page2_base_10", "return_page2_base_8"],
    });
    expect(mapping.rows.find((row) => row.id === "return_page1_local")?.transform).toEqual({
      op: "signed_rate_then_payable_floor",
      numerator: 22,
      denominator: 78,
      payable_unit_yen: 100,
    });
  });

  it("fills every required row from separate 10% and 8% bases", () => {
    const result = projectConsumptionTaxReturnRows({ bases: FULL_BASES, mapping });
    expect(result.submission).toBe("not-for-etax");
    expect(result.status).toBe("ready_for_advisor_review");
    for (const id of REQUIRED_ROW_IDS) {
      const row = result.rows.find((candidate) => candidate.id === id);
      expect(row?.row_status, id).toBe("filled");
      expect(row?.amount_yen, id).not.toBeNull();
    }
    expect(amount(result.rows, "return_page2_base_10")).toBe(1_234_000);
    expect(amount(result.rows, "return_page2_base_8")).toBe(890_000);
    expect(amount(result.rows, "schedule_1_3_base_10")).toBe(1_234_000);
    expect(amount(result.rows, "schedule_1_3_base_8")).toBe(890_000);
    expect(amount(result.rows, "return_page2_base_10")).not.toBe(1_234_000 + 890_000);
    expect(amount(result.rows, "return_page1_line_1")).toBe(1_234_000 + 890_000);
    expect(amount(result.rows, "schedule_1_3_national_output_10")).toBe(96_252);
    expect(amount(result.rows, "schedule_1_3_national_output_8")).toBe(55_536);
    expect(amount(result.rows, "schedule_1_3_national_output_10")).not.toBe(123_400);
  });

  it("transfers purchase credit and taxable bases along the mapping chain", () => {
    const result = projectConsumptionTaxReturnRows({ bases: FULL_BASES, mapping });
    const deductible = amount(result.rows, "schedule_2_3_deductible");
    expect(deductible).toBe(18_720);
    expect(amount(result.rows, "schedule_1_3_input_credit")).toBe(deductible);
    expect(amount(result.rows, "return_page1_line_4")).toBe(deductible);
    expect(amount(result.rows, "return_page1_line_1")).toBe(
      (amount(result.rows, "return_page2_base_10") ?? 0) +
        (amount(result.rows, "return_page2_base_8") ?? 0)
    );
    expect(amount(result.rows, "return_page1_line_2")).toBe(96_252 + 55_536);
    expect(amount(result.rows, "return_page1_line_5")).toBe(133_000);
    expect(amount(result.rows, "return_page1_local")).toBe(37_500);
    expect(amount(result.rows, "return_page1_line_3")).toBeNull();
    expect(amount(result.rows, "return_page1_line_6")).toBeNull();
  });

  it("floors each rate to 1,000 yen before summing", () => {
    const result = projectConsumptionTaxReturnRows({
      mapping,
      bases: {
        taxable_sales_10_yen: 1_500,
        taxable_sales_8_yen: 1_500,
        taxable_purchases_10_yen: 0,
        taxable_purchases_8_yen: 0,
      },
    });
    expect(amount(result.rows, "return_page2_base_10")).toBe(1_000);
    expect(amount(result.rows, "return_page2_base_8")).toBe(1_000);
    expect(amount(result.rows, "return_page1_line_1")).toBe(2_000);
    expect(amount(result.rows, "return_page1_line_1")).not.toBe(3_000);
    expect(amount(result.rows, "schedule_1_3_national_output_10")).toBe(78);
    expect(amount(result.rows, "schedule_1_3_national_output_10")).not.toBe(117);
    expect(amount(result.rows, "schedule_1_3_national_output_8")).toBe(62);
  });

  it("does not hundred-floor a refund", () => {
    const result = projectConsumptionTaxReturnRows({
      mapping,
      bases: {
        taxable_sales_10_yen: 1_000,
        taxable_sales_8_yen: 0,
        taxable_purchases_10_yen: 10_000,
        taxable_purchases_8_yen: 0,
      },
    });
    expect(amount(result.rows, "return_page1_line_5")).toBe(-702);
    expect(amount(result.rows, "return_page1_local")).toBe(-198);
  });

  it("blocks missing bases instead of completing them as zero", () => {
    const result = projectConsumptionTaxReturnRows({
      mapping,
      bases: {
        taxable_sales_10_yen: 1_500,
        taxable_purchases_10_yen: 0,
        taxable_purchases_8_yen: 0,
      },
    });
    expect(result.status).toBe("blocked");
    expect(amount(result.rows, "return_page2_base_8")).toBeNull();
    expect(amount(result.rows, "return_page1_line_1")).toBeNull();
    expect(result.rows.find((row) => row.id === "return_page2_base_8")?.row_status).toBe("blocked");
    expect(amount(result.rows, "return_page2_base_10")).toBe(1_000);
  });

  it("does not fill return rows for simplified tax", () => {
    const result = projectConsumptionTaxReturnRows({
      mapping,
      method: "simplified",
      bases: FULL_BASES,
    });
    expect(result.status).toBe("blocked");
    expect(amount(result.rows, "return_page1_line_1")).toBeNull();
    expect(amount(result.rows, "return_page1_line_5")).toBeNull();
  });

  it("fails the transfer check when a mapped row is pointed at the wrong source", () => {
    const broken: ConsumptionTaxReturnMap = {
      ...mapping,
      rows: mapping.rows.map((row) =>
        row.id === "return_page1_line_4"
          ? { ...row, source: { kind: "row", id: "return_page1_line_2" } }
          : row
      ),
    };
    const shifted = projectConsumptionTaxReturnRows({ bases: FULL_BASES, mapping: broken });
    expect(amount(shifted.rows, "return_page1_line_4")).not.toBe(
      amount(shifted.rows, "schedule_2_3_deductible")
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
