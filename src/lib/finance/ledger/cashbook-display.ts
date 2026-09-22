/**
 * Cashbook (現金出納帳) display for the NTA blue-return balance-sheet handguide
 * (令和7年分、表紙 R7.10). Row fields are 月, 日, 摘要, 入金, 出金, 現金残高.
 * The caller supplies the pinned worked-example rows. This module does not read them from disk.
 */

export const CASHBOOK_DISPLAY_HEADERS = ["月", "日", "摘要", "入金", "出金", "現金残高"] as const;

export const CASHBOOK_EXAMPLE_SCORE = 1;

export type CashbookExampleRow = {
  month: number;
  day: number;
  summary: string;
  inflow_yen: number;
  outflow_yen: number;
  balance_yen: number;
};

export type CashbookDisplay = {
  headers: string[];
  rows: CashbookExampleRow[];
};

/** Opening carry-forward printed on the cashbook, plus posted cash movements. */
export type CashbookBooksOpening = {
  month: number;
  day: number;
  summary: string;
  balance_yen: number;
};

export type CashbookBooksMovement = {
  occurred_on: string;
  summary: string;
  /** Cash debit (inflow). */
  cash_debit_yen: number;
  /** Cash credit (outflow). */
  cash_credit_yen: number;
};

export type CashbookBooksInput = {
  opening: CashbookBooksOpening;
  movements: readonly CashbookBooksMovement[];
};

function parseMonthDay(occurredOn: string): { month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(occurredOn.trim());
  if (!match) {
    throw new Error(`cashbook date must start with YYYY-MM-DD: ${occurredOn}`);
  }
  return { month: Number(match[2]), day: Number(match[3]) };
}

export function cashbookDisplayHeaders(): string[] {
  return [...CASHBOOK_DISPLAY_HEADERS];
}

/**
 * Project cashbook rows from company books (opening + cash movements).
 * Does not read the worked-example pin. Running balance is prior + inflow − outflow.
 */
export function projectCashbookFromBooks(input: CashbookBooksInput): CashbookDisplay {
  const rows: CashbookExampleRow[] = [
    {
      month: input.opening.month,
      day: input.opening.day,
      summary: input.opening.summary,
      inflow_yen: 0,
      outflow_yen: 0,
      balance_yen: input.opening.balance_yen,
    },
  ];
  let balance = input.opening.balance_yen;
  const sorted = input.movements
    .map((movement, index) => ({ movement, index }))
    .sort((left, right) => {
      const byDate = left.movement.occurred_on.localeCompare(right.movement.occurred_on);
      return byDate !== 0 ? byDate : left.index - right.index;
    })
    .map(({ movement }) => movement);
  for (const movement of sorted) {
    const inflow = movement.cash_debit_yen;
    const outflow = movement.cash_credit_yen;
    if (inflow < 0 || outflow < 0) {
      throw new Error("cashbook movement yen must be non-negative");
    }
    if (inflow > 0 && outflow > 0) {
      throw new Error("cashbook movement cannot be both inflow and outflow");
    }
    balance = balance + inflow - outflow;
    const { month, day } = parseMonthDay(movement.occurred_on);
    rows.push({
      month,
      day,
      summary: movement.summary.trim(),
      inflow_yen: inflow,
      outflow_yen: outflow,
      balance_yen: balance,
    });
  }
  return { headers: cashbookDisplayHeaders(), rows };
}

/**
 * Empty when every printed row matches the handguide example and running balances hold.
 * Heading-only or empty example is a miss. Partial row match is a miss.
 */
export function diffCashbookWorkedExample(
  display: CashbookDisplay,
  example: readonly CashbookExampleRow[],
): string[] {
  const misses: string[] = [];
  if (display.headers.length !== CASHBOOK_DISPLAY_HEADERS.length) {
    misses.push("headers");
  } else {
    for (let index = 0; index < CASHBOOK_DISPLAY_HEADERS.length; index += 1) {
      if (display.headers[index] !== CASHBOOK_DISPLAY_HEADERS[index]) {
        misses.push("headers");
        break;
      }
    }
  }
  if (example.length === 0) {
    misses.push("example_empty");
    return misses;
  }
  if (display.rows.length !== example.length) {
    misses.push(`row_count:${display.rows.length}!=${example.length}`);
  }
  let running = example[0]?.balance_yen ?? 0;
  const limit = Math.min(display.rows.length, example.length);
  for (let index = 0; index < limit; index += 1) {
    const actual = display.rows[index];
    const expected = example[index];
    if (!actual || !expected) {
      misses.push(`row_${index}:missing`);
      continue;
    }
    if (expected.summary.trim().length === 0) {
      misses.push(`row_${index}:summary_empty`);
    }
    if (
      actual.month !== expected.month ||
      actual.day !== expected.day ||
      actual.summary !== expected.summary
    ) {
      misses.push(`row_${index}:identity`);
    }
    if (actual.inflow_yen !== expected.inflow_yen || actual.outflow_yen !== expected.outflow_yen) {
      misses.push(`row_${index}:flow`);
    }
    if (actual.balance_yen !== expected.balance_yen) {
      misses.push(`row_${index}:balance`);
    }
    const next =
      index === 0 ? expected.balance_yen : running + expected.inflow_yen - expected.outflow_yen;
    if (expected.balance_yen !== next) {
      misses.push(`row_${index}:running`);
    }
    running = expected.balance_yen;
  }
  return misses;
}

/**
 * 1 only when the books display and the published example have an empty diff.
 * Same-change pin echo is not a books projection; callers must supply books movements.
 */
export function scoreCashbookExample(
  display: CashbookDisplay | readonly CashbookExampleRow[],
  example: readonly CashbookExampleRow[],
): 0 | 1 {
  const rows = Array.isArray(display)
    ? { headers: cashbookDisplayHeaders(), rows: display as CashbookExampleRow[] }
    : (display as CashbookDisplay);
  return diffCashbookWorkedExample(rows, example).length === 0 ? CASHBOOK_EXAMPLE_SCORE : 0;
}
