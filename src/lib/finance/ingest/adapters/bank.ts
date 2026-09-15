import { parseBankStatementCsv } from "../../../../../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/bank-statement-import.js";
import type { AdapterParseResult } from "./types.js";
import { assertNotPdf } from "./types.js";

export function parseBankAdapter(content: string, fileName: string): AdapterParseResult {
  assertNotPdf(fileName);
  const rows = parseBankStatementCsv(content);
  return {
    source_kind: "bank",
    notes: [],
    rows: rows.map((r) => ({
      occurred_on: r.date,
      direction: r.direction,
      amount_yen: Math.round(r.amount),
      payee: r.counterparty ?? "",
      description: r.description,
      category_hint: r.category,
      raw: {
        account_id: r.account_id,
        reference: r.reference ?? "",
      },
    })),
  };
}
