import {
  assertNotPdf,
  normalizeDate,
  type AdapterParseResult,
} from "./types.js";
import { parseYenAmount } from "../csv.js";
import { parseCardAdapter } from "./generic-csv.js";

/** Parse receipt MD/TXT key-value lines, or fall back to CSV. */
export function parseReceiptsAdapter(content: string, fileName: string): AdapterParseResult {
  assertNotPdf(fileName);
  if (/\.csv$/i.test(fileName)) {
    return parseCardAdapter(content, fileName);
  }
  const fields: Record<string, string> = {};
  for (const line of content.split(/\r?\n/u)) {
    const m =
      line.match(/^\s*[-*]\s*([a-zA-Z_\u3040-\u30ff\u4e00-\u9fff]+)\s*[:：]\s*(.+)\s*$/u) ||
      line.match(/^\s*([a-zA-Z_\u3040-\u30ff\u4e00-\u9fff]+)\s*[:：]\s*(.+)\s*$/u);
    if (!m) continue;
    const key = m[1]!.trim().toLowerCase();
    fields[key] = m[2]!.trim();
  }
  const date =
    fields.date || fields["日付"] || fields["利用日"] || fields["発生日"];
  const amount =
    fields.amount || fields["金額"] || fields["税込金額"] || fields["支払額"];
  if (!date || !amount) {
    return {
      source_kind: "receipts",
      rows: [],
      notes: ["receipt MD/TXT missing date or amount keys"],
    };
  }
  const payee = fields.payee || fields["支払先"] || fields["発行者"] || "";
  const description =
    fields.description || fields["摘要"] || fields["内容"] || payee || "領収書";
  return {
    source_kind: "receipts",
    notes: [],
    rows: [
      {
        occurred_on: normalizeDate(date),
        direction: "outflow",
        amount_yen: parseYenAmount(amount),
        payee,
        description,
        category_hint: fields.category || fields["科目"] || undefined,
      },
    ],
  };
}

/** Contracts are not amount-posted; return empty rows + note. */
export function parseContractsAdapter(content: string, fileName: string): AdapterParseResult {
  assertNotPdf(fileName);
  const title =
    content
      .split(/\r?\n/u)
      .map((l) => l.trim())
      .find((l) => l.startsWith("# "))
      ?.replace(/^#\s+/, "") || fileName;
  return {
    source_kind: "contracts",
    rows: [],
    notes: [
      `契約ファイルは仕訳しません（起票候補）: ${title}`,
      "data/contracts/CTR-*.yaml を Contract Agent / 手作業で作成してください",
    ],
  };
}
