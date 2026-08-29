/**
 * HTTP-facing bank statement CSV import (shared with CLI parsers).
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { bankStatementFileSchema } from "../../../schemas/jp-bank-corporate.js";
import { getDataDir, writeYamlFile } from "../utils.js";
import { getInstallRoot } from "../orgos-paths.js";
import {
  buildBankStatementEntries,
  mergeBankStatementEntries,
  parseBankStatementCsv,
} from "../../../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/bank-statement-import.js";

export type BankCsvColumnMapping = {
  date: string;
  amount: string;
  description: string;
  direction?: string;
  signed_amount?: string;
  /** 出金額・入金額の2列パターン（どちらか非空で方向推定） */
  withdrawal_amount?: string;
  deposit_amount?: string;
  category?: string;
  account_id?: string;
  reference?: string;
  counterparty?: string;
};

export type BankCsvEncoding = "utf-8" | "shift_jis" | "auto";

/**
 * Decode bank CSV bytes. Prefer UTF-8; fall back to Shift_JIS when mojibake.
 * Gate marker: bank-sjis-or-encoding
 */
export function decodeBankCsvBytes(
  bytes: Uint8Array,
  encoding: BankCsvEncoding = "auto",
): { text: string; encoding_used: "utf-8" | "shift_jis" } {
  const asUtf8 = () => new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const asSjis = () => {
    try {
      return new TextDecoder("shift_jis", { fatal: false }).decode(bytes);
    } catch {
      return "";
    }
  };
  if (encoding === "utf-8") {
    return { text: asUtf8(), encoding_used: "utf-8" };
  }
  if (encoding === "shift_jis") {
    const sjis = asSjis();
    return {
      text: sjis || asUtf8(),
      encoding_used: sjis ? "shift_jis" : "utf-8",
    };
  }
  const utf8 = asUtf8();
  if (utf8.trim() && !utf8.includes("\uFFFD")) {
    return { text: utf8, encoding_used: "utf-8" };
  }
  const sjis = asSjis();
  if (sjis.trim() && !sjis.includes("\uFFFD")) {
    return { text: sjis, encoding_used: "shift_jis" };
  }
  if (sjis.trim() && utf8.includes("\uFFFD")) {
    return { text: sjis, encoding_used: "shift_jis" };
  }
  return { text: utf8, encoding_used: "utf-8" };
}

/** Decode base64 CSV payload (browser ArrayBuffer upload path). */
export function decodeBankCsvBase64(
  base64: string,
  encoding: BankCsvEncoding = "auto",
): { text: string; encoding_used: "utf-8" | "shift_jis" } {
  const buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  return decodeBankCsvBytes(new Uint8Array(buf), encoding);
}

/** Remap arbitrary CSV headers into OrgOS canonical bank CSV. */
export function applyBankCsvColumnMapping(
  csvText: string,
  mapping: BankCsvColumnMapping,
): string {
  const lines = csvText
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV にヘッダとデータ行が必要です");
  }
  const header = splitCsvLine(lines[0]!);
  const indexOf = (name: string): number => {
    const i = header.findIndex(
      (h) => h.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (i < 0) {
      throw new Error(`必須列「${name}」が CSV ヘッダにありません`);
    }
    return i;
  };
  const dateIdx = indexOf(mapping.date);
  const descIdx = indexOf(mapping.description);
  const dirIdx = mapping.direction ? indexOf(mapping.direction) : -1;
  const signedIdx = mapping.signed_amount ? indexOf(mapping.signed_amount) : -1;
  const withdrawIdx = mapping.withdrawal_amount
    ? indexOf(mapping.withdrawal_amount)
    : -1;
  const depositIdx = mapping.deposit_amount ? indexOf(mapping.deposit_amount) : -1;
  const amountIdx =
    mapping.amount && !mapping.withdrawal_amount && !mapping.deposit_amount
      ? indexOf(mapping.amount)
      : -1;
  const catIdx = mapping.category ? indexOf(mapping.category) : -1;
  const acctIdx = mapping.account_id ? indexOf(mapping.account_id) : -1;
  const refIdx = mapping.reference ? indexOf(mapping.reference) : -1;
  const cpIdx = mapping.counterparty ? indexOf(mapping.counterparty) : -1;

  const out = [
    "date,direction,amount,category,description,account_id,reference,counterparty",
  ];
  for (let r = 1; r < lines.length; r += 1) {
    const cells = splitCsvLine(lines[r]!);
    let direction: "inflow" | "outflow";
    let amount: number;
    if (withdrawIdx >= 0 || depositIdx >= 0) {
      const withdraw = withdrawIdx >= 0
        ? Number(String(cells[withdrawIdx] ?? "").replace(/,/g, ""))
        : 0;
      const deposit = depositIdx >= 0
        ? Number(String(cells[depositIdx] ?? "").replace(/,/g, ""))
        : 0;
      if (deposit > 0 && withdraw <= 0) {
        direction = "inflow";
        amount = deposit;
      } else if (withdraw > 0 && deposit <= 0) {
        direction = "outflow";
        amount = withdraw;
      } else if (deposit > 0 && withdraw > 0) {
        throw new Error(`${r + 1} 行目: 出金額と入金額の両方に値があります`);
      } else {
        throw new Error(`${r + 1} 行目: 出金額または入金額が必要です`);
      }
    } else if (amountIdx < 0) {
      throw new Error("金額列または出金額・入金額列のマッピングが必要です");
    } else {
      const rawAmount = Number(String(cells[amountIdx] ?? "").replace(/,/g, ""));
      if (!Number.isFinite(rawAmount)) {
        throw new Error(`${r + 1} 行目: 金額が不正です`);
      }
      if (signedIdx >= 0) {
        const signed = Number(String(cells[signedIdx] ?? "").replace(/,/g, ""));
        if (!Number.isFinite(signed) || signed === 0) {
          throw new Error(`${r + 1} 行目: signed_amount が不正です`);
        }
        direction = signed > 0 ? "inflow" : "outflow";
        amount = Math.abs(signed);
      } else if (dirIdx >= 0) {
        direction = normalizeDirection(String(cells[dirIdx] ?? ""));
        amount = Math.abs(rawAmount);
      } else {
        direction = rawAmount >= 0 ? "inflow" : "outflow";
        amount = Math.abs(rawAmount);
      }
    }
    const row = [
      cells[dateIdx] ?? "",
      direction,
      String(amount),
      catIdx >= 0 ? cells[catIdx] ?? "other" : "other",
      cells[descIdx] ?? "",
      acctIdx >= 0 ? cells[acctIdx] ?? "BANK-001" : "BANK-001",
      refIdx >= 0 ? cells[refIdx] ?? "" : "",
      cpIdx >= 0 ? cells[cpIdx] ?? "" : "",
    ];
    out.push(row.map(csvEscape).join(","));
  }
  return out.join("\n");
}

function normalizeDirection(value: string): "inflow" | "outflow" {
  const normalized = value.trim().toLowerCase();
  if (["inflow", "in", "deposit", "入金"].includes(normalized)) return "inflow";
  if (["outflow", "out", "withdrawal", "出金"].includes(normalized)) return "outflow";
  throw new Error(`方向「${value}」は inflow/outflow（入金/出金）で指定してください`);
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current);
  return result;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const DEFAULT_BANK_CSV_TEMPLATE = `date,direction,amount,category,description,account_id,reference,counterparty
2026-06-15,inflow,120000,rent,六月賃料入金,BANK-001,AR-E2E-001,E2E Customer
2026-06-16,outflow,30000,office,事務用品,BANK-001,,Office Shop
`;

/** Serve product bank CSV template (install docs path, else embedded). */
export function readBankCsvTemplateText(): string {
  const path = join(getInstallRoot(), "docs/product/bank-csv-template.csv");
  if (existsSync(path)) return readFileSync(path, "utf-8");
  return DEFAULT_BANK_CSV_TEMPLATE;
}

/** Guess column mapping from Japanese / English bank CSV headers. */
export function guessBankCsvColumnMapping(
  csvText: string,
): BankCsvColumnMapping {
  const first = csvText
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) {
    return {
      date: "date",
      amount: "amount",
      description: "description",
      direction: "direction",
    };
  }
  const headers = splitCsvLine(first).map((h) => h.trim());
  const find = (...aliases: string[]): string | undefined => {
    const hit = headers.find((h) =>
      aliases.some((a) => h.toLowerCase() === a.toLowerCase()),
    );
    return hit;
  };
  const date =
    find("date", "取引日", "日付", "勘定日", "振込日", "年月日") ?? "date";
  const amount =
    find("amount", "金額", "取引金額", "出金額", "入金額") ?? "amount";
  const description =
    find("description", "摘要", "内容", "取引内容", "備考", "明細") ??
    "description";
  const direction = find(
    "direction",
    "入出金",
    "区分",
    "取引区分",
    "借貸",
    "入払区分",
  );
  const signed = find("signed_amount", "signed", "増減");
  const withdrawal = find("出金額", "withdrawal", "withdrawal_amount");
  const deposit = find("入金額", "deposit", "deposit_amount");
  return {
    date,
    amount,
    description,
    ...(direction ? { direction } : {}),
    ...(signed ? { signed_amount: signed } : {}),
    ...(withdrawal ? { withdrawal_amount: withdrawal } : {}),
    ...(deposit ? { deposit_amount: deposit } : {}),
  };
}

export function importBankStatementCsvText(input: {
  csvText: string;
  write?: boolean;
  dry_run?: boolean;
  openingBalance?: number;
  closingBalance?: number;
  adapter?: string;
  columnMapping?: BankCsvColumnMapping;
}): {
  added: number;
  duplicate_batch: boolean;
  batch_id: string;
  warnings: string[];
  entry_ids: string[];
  dry_run: boolean;
  preview_rows?: string[];
} {
  const csvText = input.columnMapping
    ? applyBankCsvColumnMapping(input.csvText, input.columnMapping)
    : input.csvText;
  const preview_rows = csvText
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);
  let rows;
  try {
    rows = parseBankStatementCsv(csvText);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`銀行 CSV の形式エラー: ${msg}`);
  }
  const built = buildBankStatementEntries(rows, {
    adapter: input.adapter ?? "generic-csv",
    openingBalance: input.openingBalance,
    closingBalance: input.closingBalance,
  });
  const path = join(getDataDir(), "finance", "bank-statements.yaml");
  const isDryRun = input.dry_run === true || input.write === false;
  if (isDryRun) {
    return {
      added: built.entries.length,
      duplicate_batch: false,
      batch_id: built.batch.id,
      warnings: built.warnings,
      entry_ids: built.entries.map((row) => row.id),
      dry_run: true,
      preview_rows: preview_rows.slice(0, 3),
    };
  }
  mkdirSync(join(getDataDir(), "finance"), { recursive: true });
  let file = existsSync(path)
    ? bankStatementFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")))
    : bankStatementFileSchema.parse({
        currency: "JPY",
        entries: [],
        import_batches: [],
      });
  const merged = mergeBankStatementEntries(file, built.entries, built.batch);
  if (!merged.duplicate_batch) {
    writeYamlFile(path, merged.file);
  }
  return {
    added: merged.added,
    duplicate_batch: merged.duplicate_batch,
    batch_id: built.batch.id,
    warnings: built.warnings,
    entry_ids: built.entries.map((row) => row.id),
    dry_run: false,
  };
}
