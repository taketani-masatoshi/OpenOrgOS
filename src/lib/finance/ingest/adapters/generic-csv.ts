import type { TaxCategory } from "../../../../../schemas/finance/journal-entry.js";
import {
  cellAt,
  headerIndexMap,
  parseCsvLine,
  parseYenAmount,
  splitCsvRows,
} from "../csv.js";
import {
  assertNotPdf,
  normalizeDate,
  normalizeDirection,
  type AdapterParseResult,
} from "./types.js";

function parseGenericExpenseCsv(
  content: string,
  fileName: string,
  source_kind: AdapterParseResult["source_kind"],
  defaultDirection: "inflow" | "outflow",
): AdapterParseResult {
  assertNotPdf(fileName);
  const lines = splitCsvRows(content);
  if (lines.length < 2) {
    return { source_kind, rows: [], notes: ["empty or header-only CSV"] };
  }
  const header = headerIndexMap(parseCsvLine(lines[0]!));
  const rows = [];
  const notes: string[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]!);
    try {
      const date = cellAt(cells, header, ["date", "利用日", "取引日", "日付", "注文日"]);
      const amountRaw = cellAt(cells, header, [
        "amount",
        "利用金額",
        "金額",
        "支払金額",
        "出金額",
      ]);
      if (!date || !amountRaw) {
        notes.push(`row ${i + 1}: skipped (missing date/amount)`);
        continue;
      }
      const dirRaw = cellAt(cells, header, ["direction", "区分", "入出金"]);
      const deposit = cellAt(cells, header, ["deposit_amount", "入金額"]);
      const withdrawal = cellAt(cells, header, ["withdrawal_amount", "出金額"]);
      let direction = normalizeDirection(dirRaw, defaultDirection);
      if (deposit && !withdrawal) direction = "inflow";
      if (withdrawal && !deposit) direction = "outflow";
      const description = cellAt(cells, header, [
        "description",
        "内容",
        "摘要",
        "商品名",
        "利用内容",
      ]);
      const payee = cellAt(cells, header, [
        "payee",
        "加盟店名",
        "利用店",
        "店舗",
        "相手先",
        "支払先",
      ]);
      const category = cellAt(cells, header, ["category", "カテゴリ", "科目"]);
      rows.push({
        occurred_on: normalizeDate(date),
        direction,
        amount_yen: parseYenAmount(amountRaw || withdrawal || deposit),
        payee,
        description: description || payee,
        category_hint: category || undefined,
        raw: Object.fromEntries(
          [...header.entries()].map(([k, idx]) => [k, cells[idx] ?? ""]),
        ),
      });
    } catch (err) {
      notes.push(`row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { source_kind, rows, notes };
}

export function parseCardAdapter(content: string, fileName: string): AdapterParseResult {
  return parseGenericExpenseCsv(content, fileName, "card", "outflow");
}

export function parseTransitAdapter(content: string, fileName: string): AdapterParseResult {
  assertNotPdf(fileName);
  const lines = splitCsvRows(content);
  if (lines.length < 2) {
    return { source_kind: "transit", rows: [], notes: ["empty CSV"] };
  }
  const header = headerIndexMap(parseCsvLine(lines[0]!));
  const rows = [];
  const notes: string[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]!);
    try {
      const date = cellAt(cells, header, ["date", "利用日", "日付"]);
      const amountRaw = cellAt(cells, header, ["amount", "金額", "利用額"]);
      if (!date || !amountRaw) continue;
      const from = cellAt(cells, header, ["from_station", "乗車駅", "発"]);
      const to = cellAt(cells, header, ["to_station", "降車駅", "着"]);
      const description =
        cellAt(cells, header, ["description", "内容", "種別"]) ||
        [from, to].filter(Boolean).join("→") ||
        "交通費";
      rows.push({
        occurred_on: normalizeDate(date),
        direction: "outflow" as const,
        amount_yen: parseYenAmount(amountRaw),
        payee: "交通系IC",
        description,
        category_hint: "旅費交通費",
      });
    } catch (err) {
      notes.push(`row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { source_kind: "transit", rows, notes };
}

export function parseWalletAdapter(content: string, fileName: string): AdapterParseResult {
  return parseGenericExpenseCsv(content, fileName, "wallet", "outflow");
}

export function parseMarketplaceAdapter(content: string, fileName: string): AdapterParseResult {
  return parseGenericExpenseCsv(content, fileName, "marketplace", "outflow");
}

export function parseSalesAdapter(content: string, fileName: string): AdapterParseResult {
  assertNotPdf(fileName);
  const lines = splitCsvRows(content);
  if (lines.length < 2) {
    return { source_kind: "sales", rows: [], notes: ["empty CSV"] };
  }
  const header = headerIndexMap(parseCsvLine(lines[0]!));
  const rows = [];
  const notes: string[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]!);
    try {
      const date = cellAt(cells, header, ["date", "請求日", "売上日", "日付"]);
      const amountRaw = cellAt(cells, header, ["amount", "金額", "税抜金額", "売上高"]);
      if (!date || !amountRaw) continue;
      const tax = cellAt(cells, header, ["tax_category", "税区分"]);
      const allowed: TaxCategory[] = [
        "taxable_10",
        "taxable_8",
        "exempt",
        "non_taxable",
        "out_of_scope",
        "tax_free",
      ];
      const tax_category: TaxCategory = allowed.includes(tax as TaxCategory)
        ? (tax as TaxCategory)
        : "taxable_10";
      rows.push({
        occurred_on: normalizeDate(date),
        direction: "inflow" as const,
        amount_yen: parseYenAmount(amountRaw),
        payee: cellAt(cells, header, ["payee", "顧客", "得意先", "請求先"]),
        description:
          cellAt(cells, header, ["description", "摘要", "内容"]) ||
          cellAt(cells, header, ["invoice_id", "請求書番号"]),
        category_hint: "売上高",
        tax_category,
      });
    } catch (err) {
      notes.push(`row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { source_kind: "sales", rows, notes };
}
