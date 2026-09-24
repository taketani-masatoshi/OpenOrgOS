/**
 * Corporate journal display for the NTA blue-return balance-sheet handguide
 * (令和7年分、表紙 R7.10). Column order is 日付, 摘要, 丁数, 借方, 貸方.
 * The account label is part of 摘要. Machine CSV headers stay in journal-export.ts.
 * The caller supplies the pinned headers and account names. This module does not read them from disk.
 */

export const JOURNAL_DISPLAY_HEADERS = ["日付", "摘要", "丁数", "借方", "貸方"] as const;

export const JOURNAL_DISPLAY_COLUMN_SCORE = 8;

export type JournalDisplaySourceLine = {
  occurredOn: string;
  description: string;
  accountLabel: string;
  folio: string;
  debitYen: number;
  creditYen: number;
};

export type JournalDisplayRow = {
  日付: string;
  摘要: string;
  丁数: string;
  借方: number;
  貸方: number;
};

export type CorporateJournalDisplay = {
  headers: string[];
  rows: JournalDisplayRow[];
};

/** Minimal books shape for display. Account names come from the chart, not from the pin. */
export type BooksJournalLineForDisplay = {
  account_code: string;
  debit_yen: number;
  credit_yen: number;
  folio?: string | null;
};

export type BooksJournalEntryForDisplay = {
  occurred_at: string;
  voided_at?: string | null;
  status?: string | null;
  lines: readonly BooksJournalLineForDisplay[];
};

const ACCOUNT_COLUMN = /勘定|科目|account(?:_code|_name)?/i;

function isPersonalDeductionColumn(header: string): boolean {
  return header.includes("控除");
}

export function journalDisplayHeaders(): string[] {
  return [...JOURNAL_DISPLAY_HEADERS];
}

export function isIndependentAccountColumn(header: string): boolean {
  return ACCOUNT_COLUMN.test(header.trim());
}

export type JournalExampleRow = {
  日付: string;
  摘要: string;
  丁数: string;
  借方: number;
  貸方: number;
};

function monthDay(date: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (iso) return `${iso[2]}-${iso[3]}`;
  return date;
}

/**
 * Empty when headers and every printed row match the handguide example and 丁数 is filled.
 * Header equality alone still leaves a miss. An empty folio is a mismatch.
 */
export function diffJournalWorkedExample(
  display: CorporateJournalDisplay,
  example: readonly JournalExampleRow[]
): string[] {
  const misses: string[] = [];
  if (scoreJournalDisplayColumns(display.headers, JOURNAL_DISPLAY_HEADERS) !== JOURNAL_DISPLAY_COLUMN_SCORE) {
    misses.push("headers");
  }
  if (example.length === 0) {
    misses.push("example_empty");
    return misses;
  }
  if (display.rows.length !== example.length) {
    misses.push(`row_count:${display.rows.length}!=${example.length}`);
  }
  const limit = Math.min(display.rows.length, example.length);
  for (let index = 0; index < limit; index += 1) {
    const actual = display.rows[index];
    const expected = example[index];
    if (!actual || !expected) {
      misses.push(`row_${index}:missing`);
      continue;
    }
    if (actual.丁数.trim().length === 0 || expected.丁数.trim().length === 0) {
      misses.push(`row_${index}:folio_empty`);
    }
    if (monthDay(actual.日付) !== monthDay(expected.日付)) {
      misses.push(`row_${index}:date`);
    }
    if (actual.摘要 !== expected.摘要) {
      misses.push(`row_${index}:summary`);
    }
    if (actual.丁数 !== expected.丁数) {
      misses.push(`row_${index}:folio`);
    }
    if (actual.借方 !== expected.借方 || actual.貸方 !== expected.貸方) {
      misses.push(`row_${index}:yen`);
    }
  }
  return misses;
}

/**
 * 8 only when the books display and the published example have an empty diff.
 * Header equality alone is 0. An empty folio is a mismatch.
 */
export function scoreJournalWorkedExample(
  display: CorporateJournalDisplay,
  example: readonly JournalExampleRow[]
): 0 | 8 {
  return diffJournalWorkedExample(display, example).length === 0
    ? JOURNAL_DISPLAY_COLUMN_SCORE
    : 0;
}

/** 8 only when the display headers equal the caller-supplied pin and contain no account column. */
export function scoreJournalDisplayColumns(
  displayHeaders: readonly string[],
  pinnedHeaders: readonly string[]
): 0 | 8 {
  if (
    displayHeaders.some(
      (header) => isIndependentAccountColumn(header) || isPersonalDeductionColumn(header)
    )
  ) {
    return 0;
  }
  if (displayHeaders.length !== pinnedHeaders.length) return 0;
  for (let index = 0; index < pinnedHeaders.length; index += 1) {
    if (displayHeaders[index] !== pinnedHeaders[index]) return 0;
  }
  return JOURNAL_DISPLAY_COLUMN_SCORE;
}

export function composeJournalSummary(accountLabel: string, description: string): string {
  const account = accountLabel.trim();
  const memo = description.trim();
  if (account.length === 0) return memo;
  if (memo.length === 0) return account;
  if (memo.includes(account)) return memo;
  return `${account} ${memo}`;
}

function displayDate(occurredOn: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(occurredOn.trim());
  if (!match) {
    throw new Error(`journal display date must start with YYYY-MM-DD: ${occurredOn}`);
  }
  return match[1];
}

export function projectCorporateJournalDisplay(
  lines: readonly JournalDisplaySourceLine[]
): CorporateJournalDisplay {
  return {
    headers: journalDisplayHeaders(),
    rows: lines.map((line) => ({
      日付: displayDate(line.occurredOn),
      摘要: composeJournalSummary(line.accountLabel, line.description),
      丁数: line.folio.trim(),
      借方: line.debitYen,
      貸方: line.creditYen,
    })),
  };
}

/**
 * Project the corporate journal display from posted books lines.
 * 摘要 is the chart account name. 丁数 is the line folio. Does not read the worked-example pin.
 */
export function projectCorporateJournalDisplayFromBooks(
  entries: readonly BooksJournalEntryForDisplay[],
  accountNameByCode: Readonly<Record<string, string>>
): CorporateJournalDisplay {
  const active = entries.filter(
    (entry) => entry.voided_at == null && entry.status !== "void"
  );
  const sorted = [...active].sort((left, right) =>
    left.occurred_at.localeCompare(right.occurred_at)
  );
  const lines: JournalDisplaySourceLine[] = [];
  for (const entry of sorted) {
    for (const line of entry.lines) {
      const accountLabel = accountNameByCode[line.account_code];
      if (accountLabel == null || accountLabel.trim().length === 0) {
        throw new Error(`journal display missing account name for ${line.account_code}`);
      }
      lines.push({
        occurredOn: entry.occurred_at,
        description: "",
        accountLabel,
        folio: line.folio ?? "",
        debitYen: line.debit_yen,
        creditYen: line.credit_yen,
      });
    }
  }
  return projectCorporateJournalDisplay(lines);
}
