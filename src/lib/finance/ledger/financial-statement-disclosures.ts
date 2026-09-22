import { loadFixedAssets } from "../../data.js";
import {
  fiscalYearEndDate,
  resolveCompanyFiscalYearEndMonth,
} from "../fiscal-year.js";
import { readYearEndDeclaration } from "../year-end-file.js";
import { equityChangeAmounts } from "./balance-sheet.js";

/**
 * A missing fact is not 「該当なし」. Only an explicit none status is.
 */
export function noteWhenDeclared(
  value: { status: "none" } | { status: "disclosed"; text: string } | undefined,
): { body: string; missing: boolean } {
  if (!value) return { body: "", missing: true };
  if (value.status === "none") return { body: "該当なし", missing: false };
  return { body: value.text, missing: false };
}

const MISSING_SURPLUS = "surplus disposal declaration missing";
const MISSING_DIVIDEND_JOURNAL = "surplus disposal dividend: no dividend journals posted";

export function buildAccountingPolicyParagraph(_input?: {
  asOf?: string;
  fiscalYear?: string;
}): string {
  const loaded = loadDepreciationMethods();
  if (loaded.count === 0) {
    return "会計方針: 固定資産はない。収益および費用は発生主義で認識する。";
  }
  if (loaded.methods.length === 1) {
    return `会計方針: 減価償却は${loaded.methods[0]}により計上する。収益および費用は発生主義で認識する。`;
  }
  return `会計方針: 減価償却は方法が混在する（${loaded.methods.join("・")}）。収益および費用は発生主義で認識する。`;
}

export function buildEquityMovementParagraph(input?: {
  asOf?: string;
  fiscalYear?: string;
}): string {
  const change = equityChangeAmounts(input);
  if (change.dividend_yen !== 0 || change.capital_yen !== 0) {
    return `配当 ${change.dividend_yen} 円、資本取引 ${change.capital_yen} 円`;
  }
  if (!input?.fiscalYear) return "配当・資本取引: 宣言がない";
  const declaration = readYearEndDeclaration(input.fiscalYear);
  if (declaration.ok && declaration.value.surplus_disposal?.status === "none") {
    return "配当・資本取引: 該当なし";
  }
  return "配当・資本取引: 宣言がない";
}

export function buildSubsequentEventsParagraph(fiscalYear: string): {
  line: string;
  errors: string[];
} {
  const declaration = readYearEndDeclaration(fiscalYear);
  if (!declaration.ok) {
    return { line: "後発事象: 宣言がない", errors: ["subsequent events missing"] };
  }
  if (declaration.value.subsequent_events.status === "none") {
    return { line: "後発事象: 該当なし", errors: [] };
  }
  return {
    line: `後発事象: ${declaration.value.subsequent_events.text}`,
    errors: [],
  };
}

/**
 * Surplus disposal is a statement disclosure, not an annual-close gate.
 * Missing declaration leaves the statement incomplete and posts nothing.
 */
export function buildSurplusDisposalParagraph(fiscalYear: string): {
  text: string;
  errors: string[];
} {
  const declaration = readYearEndDeclaration(fiscalYear);
  if (!declaration.ok || !declaration.value.surplus_disposal) {
    return { text: "", errors: [MISSING_SURPLUS] };
  }
  if (declaration.value.surplus_disposal.status === "none") {
    return {
      text: "剰余金の処分: 該当なし（株主総会決議事項・処分なし宣言）",
      errors: [],
    };
  }
  const dividendYen = dividendFromJournals(fiscalYear);
  if (dividendYen <= 0) {
    return { text: "", errors: [MISSING_DIVIDEND_JOURNAL] };
  }
  return {
    text: `剰余金の処分: 配当 ${dividendYen} 円（仕訳に基づく）`,
    errors: [],
  };
}

function loadDepreciationMethods(): { count: number; methods: string[] } {
  const assets = readFixedAssets();
  const methods = [
    ...new Set(
      assets
        .map((asset) => asset.depreciation_method)
        .filter((method): method is string => Boolean(method)),
    ),
  ];
  return { count: assets.length, methods };
}

function readFixedAssets(): Array<{ depreciation_method?: string }> {
  try {
    return loadFixedAssets().assets;
  } catch {
    return [];
  }
}

function dividendFromJournals(fiscalYear: string): number {
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf = fiscalYearEndDate(fiscalYear, endMonth);
  return equityChangeAmounts({ asOf, fiscalYear }).dividend_yen;
}
