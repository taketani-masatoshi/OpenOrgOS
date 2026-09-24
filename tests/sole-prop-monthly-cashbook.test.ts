import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  projectCashbookFromBooks,
  type CashbookExampleRow,
} from "../src/lib/finance/ledger/cashbook-display.js";
import {
  SOLE_PROP_CASHBOOK_PIN_KIND,
  projectSolePropCashbookFromBooks,
  scoreSolePropCashbookForm,
} from "../src/lib/finance/sole-prop-monthly-close.js";

const pinSchema = z
  .object({
    kind: z.string().min(1),
    rows: z
      .array(
        z.object({
          month: z.number().int(),
          day: z.number().int(),
          summary: z.string().min(1),
          inflow_yen: z.number().int(),
          outflow_yen: z.number().int(),
          balance_yen: z.number().int(),
        }),
      )
      .min(1),
  })
  .passthrough();

function loadSolePin() {
  const path = fileURLToPath(
    new URL("./fixtures/sole-prop/cashbook-handguide-january.yaml", import.meta.url),
  );
  return pinSchema.parse(parseYaml(readFileSync(path, "utf8")));
}

function loadCorpPinRows(): CashbookExampleRow[] {
  const path = fileURLToPath(
    new URL("./fixtures/monthly-close/cashbook-example.yaml", import.meta.url),
  );
  const raw = z
    .object({
      rows: z.array(
        z.object({
          month: z.number().int(),
          day: z.number().int(),
          summary: z.string(),
          inflow_yen: z.number().int(),
          outflow_yen: z.number().int(),
          balance_yen: z.number().int(),
        }),
      ),
    })
    .parse(parseYaml(readFileSync(path, "utf8")));
  return raw.rows;
}

const books = {
  opening: { month: 1, day: 1, summary: "前年より繰越", balance_yen: 292300 },
  movements: [
    { occurred_on: "2025-01-03", summary: "現金売上", cash_debit_yen: 270000, cash_credit_yen: 0 },
    { occurred_on: "2025-01-04", summary: "当座預金", cash_debit_yen: 0, cash_credit_yen: 180000 },
    { occurred_on: "2025-01-06", summary: "消耗品費", cash_debit_yen: 0, cash_credit_yen: 2500 },
    { occurred_on: "2025-01-18", summary: "現金仕入", cash_debit_yen: 0, cash_credit_yen: 60000 },
    { occurred_on: "2025-01-25", summary: "事業主貸", cash_debit_yen: 0, cash_credit_yen: 200000 },
    { occurred_on: "2025-01-25", summary: "買掛金", cash_debit_yen: 0, cash_credit_yen: 36000 },
  ],
};

describe("sole-prop monthly cashbook dedicated form pin", () => {
  it("scores 1 only with dedicated sole_prop_handguide pin empty diff", () => {
    const pin = loadSolePin();
    expect(pin.kind).toBe(SOLE_PROP_CASHBOOK_PIN_KIND);
    const display = projectSolePropCashbookFromBooks(books);
    expect(scoreSolePropCashbookForm(display, pin)).toBe(1);
  });

  it("scores 0 when only a corporate monthly-close pin is supplied", () => {
    const display = projectCashbookFromBooks(books);
    const corpOnly = { kind: "corporate_monthly_close", rows: loadCorpPinRows() };
    expect(scoreSolePropCashbookForm(display, corpOnly)).toBe(0);
  });
});
