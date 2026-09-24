/**
 * First-table required line coverage for sole-prop income tax.
 * Empty pin / self-expect-only / missing required ids score 0.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  incomeTaxReturnYenDiff,
  scoreIncomeTaxReturn,
  type IncomeTaxReturnLine,
} from "../src/lib/finance/sole-prop-core-score.js";

const fixtureSchema = z.object({
  lines: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(1),
});

function loadRequiredIds(): string[] {
  const path = fileURLToPath(new URL("./fixtures/sole-prop/income-tax-lines.yaml", import.meta.url));
  return fixtureSchema.parse(parseYaml(readFileSync(path, "utf8"))).lines.map((row) => row.id);
}

const REQUIRED = () => loadRequiredIds();

function projected(basic: number): IncomeTaxReturnLine[] {
  return [
    { id: "income", label: "所得金額", amount_yen: 4_000_000 },
    { id: "deduction", label: "所得控除", amount_yen: basic + 100_000 },
    { id: "taxable_income", label: "課税される所得金額", amount_yen: 3_220_000 },
    { id: "tax", label: "所得税額", amount_yen: 200_000 },
    { id: "basic_deduction", label: "基礎控除", amount_yen: basic },
  ];
}

describe("sole-prop income tax required-line coverage", () => {
  it("requires the fixture first-table line ids including basic_deduction", () => {
    const ids = REQUIRED();
    expect(ids).toContain("basic_deduction");
    expect(ids).toEqual(["income", "deduction", "taxable_income", "tax", "basic_deduction"]);
  });

  it("scores 0 on empty pin or self-expect without official yen", () => {
    const lines = projected(680_000);
    expect(
      scoreIncomeTaxReturn({ lines, requiredLineIds: REQUIRED(), pinnedYen: [] }),
    ).toBe(0);
  });

  it("scores 20 only when every required line matches the official yen pin", () => {
    const lines = projected(680_000);
    const pin = lines.map((row) => ({ id: row.id, amount_yen: row.amount_yen! }));
    expect(incomeTaxReturnYenDiff(lines, pin)).toEqual([]);
    expect(scoreIncomeTaxReturn({ lines, requiredLineIds: REQUIRED(), pinnedYen: pin })).toBe(20);
  });

  it("scores 0 when a required line is missing from the projection", () => {
    const lines = projected(680_000).filter((row) => row.id !== "tax");
    const pin = [
      { id: "income", amount_yen: 4_000_000 },
      { id: "deduction", amount_yen: 780_000 },
      { id: "taxable_income", amount_yen: 3_220_000 },
      { id: "tax", amount_yen: 200_000 },
      { id: "basic_deduction", amount_yen: 680_000 },
    ];
    expect(scoreIncomeTaxReturn({ lines, requiredLineIds: REQUIRED(), pinnedYen: pin })).toBe(0);
  });
});
