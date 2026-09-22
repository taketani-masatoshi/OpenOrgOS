import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  diffOwnerCapitalWorkedExample,
  projectOwnerCapitalFromBooks,
  scoreOwnerCapitalWorkedExample,
  type OwnerCapitalBooksInput,
  type OwnerCapitalExample,
} from "../src/lib/finance/ledger/owner-capital-display.js";
import { scoreOwnerCapital } from "../src/lib/finance/sole-prop-core-score.js";

const EXAMPLE_PATH = join(import.meta.dirname, "fixtures/sole-prop/owner-capital-example.yaml");
const BOOKS_PATH = join(
  import.meta.dirname,
  "fixtures/sole-prop/owner-capital-handguide-books.yaml",
);
const DISPLAY_SOURCE = join(
  import.meta.dirname,
  "../src/lib/finance/ledger/owner-capital-display.ts",
);

function loadExample(): OwnerCapitalExample {
  const parsed = parseYaml(readFileSync(EXAMPLE_PATH, "utf8")) as {
    lines?: OwnerCapitalExample["lines"];
    next_opening_capital_yen?: number;
  };
  if (!parsed.lines || typeof parsed.next_opening_capital_yen !== "number") {
    throw new Error("owner-capital-example.yaml must list lines and next_opening_capital_yen");
  }
  return {
    lines: parsed.lines,
    next_opening_capital_yen: parsed.next_opening_capital_yen,
  };
}

function loadBooks(): OwnerCapitalBooksInput {
  const parsed = parseYaml(readFileSync(BOOKS_PATH, "utf8")) as {
    accounts?: Record<string, string>;
    owner_capital_code?: string;
    owner_income_code?: string;
    owner_advances_code?: string;
    owner_drawings_code?: string;
    opening_capital_yen?: number;
    movements?: OwnerCapitalBooksInput["movements"];
  };
  if (
    !parsed.accounts ||
    !parsed.owner_capital_code ||
    !parsed.owner_income_code ||
    !parsed.owner_advances_code ||
    !parsed.owner_drawings_code ||
    typeof parsed.opening_capital_yen !== "number" ||
    !parsed.movements
  ) {
    throw new Error("owner-capital-handguide-books.yaml must list codes, opening, movements");
  }
  return {
    account_name_by_code: parsed.accounts,
    owner_capital_code: parsed.owner_capital_code,
    owner_income_code: parsed.owner_income_code,
    owner_advances_code: parsed.owner_advances_code,
    owner_drawings_code: parsed.owner_drawings_code,
    opening_capital_yen: parsed.opening_capital_yen,
    movements: parsed.movements,
  };
}

describe("owner capital handguide display", () => {
  it("scores 18 from sole-prop books against the handguide pin with an empty diff", () => {
    const example = loadExample();
    const books = loadBooks();
    const display = projectOwnerCapitalFromBooks(books);
    expect(diffOwnerCapitalWorkedExample(display, example)).toEqual([]);
    expect(scoreOwnerCapitalWorkedExample(display, example)).toBe(18);
    expect(display.lines[0]).toEqual({
      account_name: "元入金",
      opening_yen: 8_762_460,
      closing_yen: 8_762_460,
    });
    expect(display.lines[1]?.closing_yen).toBe(3_983_920);
    expect(display.lines[2]?.closing_yen).toBe(281_450);
    expect(display.lines[3]?.closing_yen).toBe(2_936_000);
    expect(display.next_opening_capital_yen).toBe(10_091_830);
    expect(display.income_folded_into_capital).toBe(false);
    expect(JSON.stringify(books)).toContain("account_code");
    expect(JSON.stringify(display)).not.toContain("account_code");
  });

  it("scores 0 when income is folded into 元入金", () => {
    const example = loadExample();
    const books = loadBooks();
    const folded = projectOwnerCapitalFromBooks({
      ...books,
      movements: [
        {
          account_code: books.owner_capital_code,
          debit_yen: 0,
          credit_yen: 3_983_920,
        },
        {
          account_code: books.owner_advances_code,
          debit_yen: 0,
          credit_yen: 281_450,
        },
        {
          account_code: books.owner_drawings_code,
          debit_yen: 2_936_000,
          credit_yen: 0,
        },
      ],
    });
    expect(folded.income_folded_into_capital).toBe(true);
    expect(folded.lines[0]?.closing_yen).toBe(8_762_460 + 3_983_920);
    expect(scoreOwnerCapitalWorkedExample(folded, example)).toBe(0);
    expect(diffOwnerCapitalWorkedExample(folded, example)).toContain("income_folded_into_capital");
    expect(
      scoreOwnerCapital({
        openingYen: 8_762_460,
        closingYen: 8_762_460 + 3_983_920,
        incomeYen: 3_983_920,
        capitalTransferYen: 3_983_920,
        incomeIsSeparateLine: false,
      }),
    ).toBe(0);
  });

  it("does not treat pin echo as the books path, and rejects a one-yen shift", () => {
    const example = loadExample();
    const books = loadBooks();
    const display = projectOwnerCapitalFromBooks(books);
    expect(scoreOwnerCapitalWorkedExample(display, example)).toBe(18);

    const echoed: typeof display = {
      lines: example.lines.map((line) => ({ ...line })),
      next_opening_capital_yen: example.next_opening_capital_yen,
      income_folded_into_capital: false,
    };
    expect(scoreOwnerCapitalWorkedExample(echoed, example)).toBe(18);
    expect(JSON.stringify(books.movements)).toContain("account_code");
    expect(JSON.stringify(echoed)).not.toContain("account_code");

    const shifted = {
      ...display,
      lines: display.lines.map((line, index) =>
        index === 0 ? { ...line, closing_yen: line.closing_yen + 1 } : line,
      ),
    };
    expect(scoreOwnerCapitalWorkedExample(shifted, example)).toBe(0);
    expect(diffOwnerCapitalWorkedExample(shifted, example)).toContain("row_0:closing");
  });

  it("does not load the capital pin or books fixture from product code", () => {
    const source = readFileSync(DISPLAY_SOURCE, "utf8");
    expect(source).not.toContain("tests/fixtures");
    expect(source).not.toContain("owner-capital-example.yaml");
    expect(source).not.toContain("owner-capital-handguide-books.yaml");
    expect(source).not.toMatch(/from ["']yaml["']/);
  });
});
