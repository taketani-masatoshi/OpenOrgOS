import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { JOURNAL_EXPORT_HEADER } from "../src/lib/finance/ledger/journal-export.js";
import {
  composeJournalSummary,
  diffJournalWorkedExample,
  journalDisplayHeaders,
  projectCorporateJournalDisplay,
  projectCorporateJournalDisplayFromBooks,
  scoreJournalDisplayColumns,
  scoreJournalWorkedExample,
  type BooksJournalEntryForDisplay,
  type JournalExampleRow,
} from "../src/lib/finance/ledger/journal-display.js";

const PIN_PATH = join(import.meta.dirname, "fixtures/books/journal-columns.yaml");
const EXAMPLE_PATH = join(import.meta.dirname, "fixtures/books/journal-example.yaml");
const BOOKS_PATH = join(import.meta.dirname, "fixtures/books/journal-handguide-books.yaml");
const DISPLAY_SOURCE = join(import.meta.dirname, "../src/lib/finance/ledger/journal-display.js").replace(
  /\.js$/,
  ".ts"
);

const HANDGUIDE_HEADERS = ["日付", "摘要", "丁数", "借方", "貸方"] as const;

function loadPinnedHeaders(): string[] {
  const parsed = parseYaml(readFileSync(PIN_PATH, "utf8")) as { headers?: unknown };
  if (
    !parsed ||
    !Array.isArray(parsed.headers) ||
    parsed.headers.some((header) => typeof header !== "string")
  ) {
    throw new Error("journal-columns.yaml must list string headers");
  }
  return [...parsed.headers];
}

function loadHandguideExample(): JournalExampleRow[] {
  const parsed = parseYaml(readFileSync(EXAMPLE_PATH, "utf8")) as {
    rows?: Array<{
      date: string;
      summary: string;
      folio: string;
      debit_yen: number;
      credit_yen: number;
    }>;
  };
  return (parsed.rows ?? []).map((row) => ({
    日付: row.date,
    摘要: row.summary,
    丁数: row.folio,
    借方: row.debit_yen,
    貸方: row.credit_yen,
  }));
}

function loadHandguideBooks(): {
  accounts: Record<string, string>;
  entries: BooksJournalEntryForDisplay[];
} {
  const parsed = parseYaml(readFileSync(BOOKS_PATH, "utf8")) as {
    accounts?: Record<string, string>;
    entries?: BooksJournalEntryForDisplay[];
  };
  if (!parsed.accounts || !parsed.entries) {
    throw new Error("journal-handguide-books.yaml must list accounts and entries");
  }
  return { accounts: parsed.accounts, entries: parsed.entries };
}

describe("journal display columns", () => {
  it("scores 8 only when the display headers equal the handguide pin", () => {
    const pinned = loadPinnedHeaders();
    expect(pinned).toEqual([...HANDGUIDE_HEADERS]);
    const display = journalDisplayHeaders();
    expect(display).toEqual(pinned);
    expect(scoreJournalDisplayColumns(display, pinned)).toBe(8);
    const projected = projectCorporateJournalDisplay([]);
    expect(projected.headers).toEqual(pinned);
    expect(scoreJournalDisplayColumns(projected.headers, pinned)).toBe(8);
  });

  it("scores 0 when an independent account column appears anywhere", () => {
    const pinned = loadPinnedHeaders();
    const accountHeaders = [
      "勘定科目",
      "勘定",
      "科目",
      "借方科目",
      "貸方科目",
      "account",
      "account_code",
      "account_name",
    ];
    for (const accountHeader of accountHeaders) {
      const inserted = [...pinned];
      inserted.splice(1, 0, accountHeader);
      expect(scoreJournalDisplayColumns(inserted, pinned)).toBe(0);
      expect(scoreJournalDisplayColumns(inserted, inserted)).toBe(0);
      expect(scoreJournalDisplayColumns([accountHeader], [accountHeader])).toBe(0);
    }
    expect(scoreJournalDisplayColumns([...JOURNAL_EXPORT_HEADER], pinned)).toBe(0);
    expect(scoreJournalDisplayColumns([...JOURNAL_EXPORT_HEADER], [...JOURNAL_EXPORT_HEADER])).toBe(
      0
    );
  });

  it("gives no partial credit for a different header list", () => {
    const pinned = loadPinnedHeaders();
    const reordered = [...pinned].reverse();
    expect(scoreJournalDisplayColumns(reordered, pinned)).toBe(0);
    expect(scoreJournalDisplayColumns(pinned.slice(0, 4), pinned)).toBe(0);
    expect(scoreJournalDisplayColumns([...pinned, "所得控除"], pinned)).toBe(0);
    expect(scoreJournalDisplayColumns([...pinned, "基礎控除"], [...pinned, "基礎控除"])).toBe(0);
    expect(scoreJournalDisplayColumns([], pinned)).toBe(0);
    const almost = [...pinned];
    almost[3] = "借方金額";
    expect(scoreJournalDisplayColumns(almost, pinned)).toBe(0);
  });

  it("folds the account into 摘要 and leaves the machine CSV headers unchanged", () => {
    expect([...JOURNAL_EXPORT_HEADER]).toEqual([
      "entry_id",
      "occurred_at",
      "description",
      "account_code",
      "debit_yen",
      "credit_yen",
      "tax_category",
      "source_kind",
      "notes",
    ]);
    const pinned = loadPinnedHeaders();
    const display = projectCorporateJournalDisplay([
      {
        occurredOn: "2026-07-01T00:00:00.000Z",
        description: "事務用品",
        accountLabel: "消耗品費",
        folio: "12",
        debitYen: 500,
        creditYen: 0,
      },
      {
        occurredOn: "2026-07-01",
        description: "消耗品費 事務用品",
        accountLabel: "消耗品費",
        folio: " 12 ",
        debitYen: 0,
        creditYen: 500,
      },
    ]);
    expect(display.headers).toEqual(pinned);
    expect(display.rows[0]).toEqual({
      日付: "2026-07-01",
      摘要: "消耗品費 事務用品",
      丁数: "12",
      借方: 500,
      貸方: 0,
    });
    expect(composeJournalSummary("消耗品費", "消耗品費 事務用品")).toBe("消耗品費 事務用品");
    expect(Object.keys(display.rows[0]!)).toEqual([...pinned]);
    expect(Object.keys(display.rows[1]!)).toEqual([...pinned]);
    expect(display.rows[1]?.摘要).toBe("消耗品費 事務用品");
    expect(display.rows[1]?.丁数).toBe("12");
    expect(JSON.stringify(display)).not.toContain("account_code");
    expect(JSON.stringify(display)).not.toContain("所得控除");
    expect(JSON.stringify(display)).not.toContain("基礎控除");
  });

  it("does not load the column pin or books fixture from product code", () => {
    const source = readFileSync(DISPLAY_SOURCE, "utf8");
    expect(source).not.toContain("tests/fixtures");
    expect(source).not.toContain("journal-columns.yaml");
    expect(source).not.toContain("journal-example.yaml");
    expect(source).not.toContain("journal-handguide-books.yaml");
    expect(source).not.toMatch(/from ["']yaml["']/);
  });

  it("scores 8 from company books against the handguide pin with an empty diff", () => {
    const example = loadHandguideExample();
    const books = loadHandguideBooks();
    const display = projectCorporateJournalDisplayFromBooks(books.entries, books.accounts);
    expect(diffJournalWorkedExample(display, example)).toEqual([]);
    expect(scoreJournalWorkedExample(display, example)).toBe(8);
    expect(display.rows.map((row) => row.丁数)).toEqual(["1", "4", "3", "3", "2", "1", "5", "2"]);
    expect(display.rows[0]).toMatchObject({
      摘要: "現金",
      借方: 300000,
      貸方: 0,
    });
    expect(display.rows[2]).toMatchObject({
      摘要: "売上：食料品",
      借方: 0,
      貸方: 300000,
    });
  });

  it("scores 0 when 丁数 is empty or yen shifts, and does not treat pin echo as books", () => {
    const example = loadHandguideExample();
    const blankFolio = projectCorporateJournalDisplay([
      {
        occurredOn: "2025-11-01",
        description: "現金",
        accountLabel: "",
        folio: "",
        debitYen: 300000,
        creditYen: 0,
      },
    ]);
    expect(scoreJournalWorkedExample(blankFolio, [{ ...example[0]!, 丁数: "" }])).toBe(0);
    expect(scoreJournalWorkedExample(blankFolio, [example[0]!])).toBe(0);
    expect(diffJournalWorkedExample(blankFolio, [example[0]!]).some((m) => m.includes("folio"))).toBe(
      true
    );

    const books = loadHandguideBooks();
    const display = projectCorporateJournalDisplayFromBooks(books.entries, books.accounts);
    const shifted = {
      headers: display.headers,
      rows: display.rows.map((row, index) =>
        index === 0 ? { ...row, 借方: row.借方 + 1 } : row
      ),
    };
    expect(scoreJournalWorkedExample(shifted, example)).toBe(0);
    expect(diffJournalWorkedExample(shifted, example)).toContain("row_0:yen");

    // Feeding the pin back through the line projector is not the books path.
    const echoed = projectCorporateJournalDisplay(
      example.map((row) => ({
        occurredOn: `2025-${row.日付}`,
        description: row.摘要,
        accountLabel: "",
        folio: row.丁数,
        debitYen: row.借方,
        creditYen: row.貸方,
      }))
    );
    expect(scoreJournalWorkedExample(echoed, example)).toBe(8);
    expect(JSON.stringify(books.entries)).toContain("account_code");
    expect(JSON.stringify(echoed)).not.toContain("account_code");
  });

  it("skips voided books entries and requires chart names", () => {
    const example = loadHandguideExample();
    const books = loadHandguideBooks();
    const withVoid = projectCorporateJournalDisplayFromBooks(
      [
        ...books.entries,
        {
          occurred_at: "2025-11-30T00:00:00.000Z",
          voided_at: "2025-11-30T12:00:00.000Z",
          lines: [
            {
              account_code: "1100",
              debit_yen: 1,
              credit_yen: 0,
              folio: "9",
            },
            {
              account_code: "1110",
              debit_yen: 0,
              credit_yen: 1,
              folio: "9",
            },
          ],
        },
      ],
      books.accounts
    );
    expect(diffJournalWorkedExample(withVoid, example)).toEqual([]);
    expect(() =>
      projectCorporateJournalDisplayFromBooks(books.entries, { "1100": "現金" })
    ).toThrow(/1150/);
  });
});
