import type { SignedReceiptQrPayload } from "../../../schemas/receipt-qr.js";

export type ExpenseAccountSuggestion = {
  account_code: "5710" | "5720" | "5730";
  confidence: "high";
  reasons: string[];
};

const RULES: Array<{ account_code: ExpenseAccountSuggestion["account_code"]; pattern: RegExp }> = [
  { account_code: "5720", pattern: /pasmo|suica|交通|電車|鉄道|タクシー|バス/i },
  { account_code: "5730", pattern: /会議|会場/ },
  { account_code: "5710", pattern: /接待|交際|贈答/ },
];

/** Infer only explicit, high-confidence descriptions; unknown text has no suggestion. */
export function inferExpenseAccountFromReceipt(
  payload: SignedReceiptQrPayload,
): ExpenseAccountSuggestion | undefined {
  const descriptions = payload.receipt.lines.map((line) => line.description);
  for (const rule of RULES) {
    const reasons = descriptions.filter((description) =>
      rule.pattern.test(description),
    );
    if (reasons.length > 0) {
      return {
        account_code: rule.account_code,
        confidence: "high",
        reasons: reasons.map((description) => `receipt line: ${description}`),
      };
    }
  }
  return undefined;
}

export function assertExpenseAccountConsistent(
  selectedAccountCode: string,
  suggestion: ExpenseAccountSuggestion | undefined,
): void {
  if (!suggestion || suggestion.account_code === selectedAccountCode) return;
  throw new Error(
    `blocked_account_mismatch: 領収書明細から勘定科目 ${suggestion.account_code} が強く示唆されます。` +
      `選択された ${selectedAccountCode} と一致しません（${suggestion.reasons.join("、")}）`,
  );
}
