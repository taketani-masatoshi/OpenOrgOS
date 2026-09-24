/**
 * Sole-prop balance-sheet capital display for the NTA blue-return
 * 貸借対照表作成の手引き（令和7年分）.
 * Lines are 元入金 / 所得 / 事業主借 / 事業主貸. Callers supply the pinned example.
 * This module does not read fixture files.
 */

import { nextOpeningCapitalYen } from "../sole-prop-core-score.js";

export const OWNER_CAPITAL_EXAMPLE_SCORE = 18 as const;

export const OWNER_CAPITAL_LINE_NAMES = [
  "元入金",
  "青色申告特別控除前の所得金額",
  "事業主借",
  "事業主貸",
] as const;

export type OwnerCapitalExampleLine = {
  account_name: string;
  opening_yen: number;
  closing_yen: number;
};

export type OwnerCapitalExample = {
  lines: readonly OwnerCapitalExampleLine[];
  next_opening_capital_yen: number;
};

export type OwnerCapitalDisplay = {
  lines: OwnerCapitalExampleLine[];
  next_opening_capital_yen: number;
  income_folded_into_capital: boolean;
};

/** Posted equity / owner books. Account names come from the chart, not from the pin. */
export type OwnerCapitalBooksMovement = {
  account_code: string;
  debit_yen: number;
  credit_yen: number;
};

export type OwnerCapitalBooksInput = {
  account_name_by_code: Readonly<Record<string, string>>;
  owner_capital_code: string;
  owner_income_code: string;
  owner_advances_code: string;
  owner_drawings_code: string;
  /** 期首の元入金（手引きでは期末と同額）。 */
  opening_capital_yen: number;
  /** 期中の事業主貸・借・所得勘定への仕訳。元入金へ所得を載せない。 */
  movements: readonly OwnerCapitalBooksMovement[];
};

function netCredit(movements: readonly OwnerCapitalBooksMovement[], code: string): number {
  let net = 0;
  for (const movement of movements) {
    if (movement.account_code !== code) continue;
    if (movement.debit_yen < 0 || movement.credit_yen < 0) {
      throw new Error("owner capital movement yen must be non-negative");
    }
    net += movement.credit_yen - movement.debit_yen;
  }
  return net;
}

function requireName(
  accountNameByCode: Readonly<Record<string, string>>,
  code: string,
): string {
  const name = accountNameByCode[code];
  if (name == null || name.trim().length === 0) {
    throw new Error(`owner capital display missing account name for ${code}`);
  }
  return name;
}

/**
 * Project the capital section from sole-prop books (opening 元入金 + year movements).
 * Does not read the worked-example pin.
 */
export function projectOwnerCapitalFromBooks(
  input: OwnerCapitalBooksInput,
): OwnerCapitalDisplay {
  const capitalName = requireName(input.account_name_by_code, input.owner_capital_code);
  const incomeName = requireName(input.account_name_by_code, input.owner_income_code);
  const advancesName = requireName(input.account_name_by_code, input.owner_advances_code);
  const drawingsName = requireName(input.account_name_by_code, input.owner_drawings_code);

  const capitalTransfer = netCredit(input.movements, input.owner_capital_code);
  const incomeYen = netCredit(input.movements, input.owner_income_code);
  const advancesYen = netCredit(input.movements, input.owner_advances_code);
  const drawingsYen = -netCredit(input.movements, input.owner_drawings_code);

  const openingCapital = input.opening_capital_yen;
  const closingCapital = openingCapital + capitalTransfer;
  // 手引きでは元入金は期首＝期末。期中に元入金へ所得を載せる振替は折込。
  const incomeFoldedIntoCapital = capitalTransfer !== 0;

  const lines: OwnerCapitalExampleLine[] = [
    {
      account_name: capitalName,
      opening_yen: openingCapital,
      closing_yen: closingCapital,
    },
    {
      account_name: incomeName,
      opening_yen: 0,
      closing_yen: incomeYen,
    },
    {
      account_name: advancesName,
      opening_yen: 0,
      closing_yen: advancesYen,
    },
    {
      account_name: drawingsName,
      opening_yen: 0,
      closing_yen: drawingsYen,
    },
  ];

  const nextOpening = nextOpeningCapitalYen({
    closingCapitalYen: closingCapital,
    incomeBeforeBlueYen: incomeYen,
    ownerAdvancesYen: advancesYen,
    ownerDrawingsYen: drawingsYen,
  });

  return {
    lines,
    next_opening_capital_yen: nextOpening,
    income_folded_into_capital: incomeFoldedIntoCapital,
  };
}

/**
 * Empty when every capital line and the next-opening yen match the handguide pin.
 * Folding income into 元入金 is always a miss. Heading-only or empty example is a miss.
 */
export function diffOwnerCapitalWorkedExample(
  display: OwnerCapitalDisplay,
  example: OwnerCapitalExample,
): string[] {
  const misses: string[] = [];
  if (display.income_folded_into_capital) {
    misses.push("income_folded_into_capital");
  }
  if (example.lines.length === 0) {
    misses.push("example_empty");
    return misses;
  }
  if (display.lines.length !== example.lines.length) {
    misses.push(`row_count:${display.lines.length}!=${example.lines.length}`);
  }
  const limit = Math.min(display.lines.length, example.lines.length);
  for (let index = 0; index < limit; index += 1) {
    const actual = display.lines[index];
    const expected = example.lines[index];
    if (!actual || !expected) {
      misses.push(`row_${index}:missing`);
      continue;
    }
    if (actual.account_name !== expected.account_name) {
      misses.push(`row_${index}:name`);
    }
    if (actual.opening_yen !== expected.opening_yen) {
      misses.push(`row_${index}:opening`);
    }
    if (actual.closing_yen !== expected.closing_yen) {
      misses.push(`row_${index}:closing`);
    }
  }
  if (display.next_opening_capital_yen !== example.next_opening_capital_yen) {
    misses.push("next_opening");
  }
  const capital = example.lines.find((line) => line.account_name === "元入金");
  const income = example.lines.find(
    (line) => line.account_name === "青色申告特別控除前の所得金額",
  );
  if (capital && capital.opening_yen !== capital.closing_yen) {
    misses.push("pin_capital_unequal");
  }
  if (income && capital && capital.closing_yen === capital.opening_yen + income.closing_yen) {
    misses.push("pin_folds_income");
  }
  return misses;
}

/**
 * 18 only when the books display and the published example have an empty diff.
 * Same-change pin echo is not a books projection; callers must supply account_code books.
 */
export function scoreOwnerCapitalWorkedExample(
  display: OwnerCapitalDisplay,
  example: OwnerCapitalExample,
): 0 | 18 {
  return diffOwnerCapitalWorkedExample(display, example).length === 0
    ? OWNER_CAPITAL_EXAMPLE_SCORE
    : 0;
}
