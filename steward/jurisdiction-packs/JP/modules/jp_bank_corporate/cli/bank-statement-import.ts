import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type {
  BankStatementImportBatch,
  BankStatementEntry,
  BankStatementFile,
} from "../../../../../../schemas/jp-bank-corporate.js";
import type { ChartOfAccounts } from "../../../../../../schemas/finance/types.js";
import { currentDate } from "../../../../../../src/lib/utils.js";
import { resolveDefaultAccountId } from "./calendar-import.js";
import { resolveChartAccountId } from "./chart-account.js";

export interface BankStatementCsvRow {
  date: string;
  direction: "inflow" | "outflow";
  amount: number;
  category: string;
  description: string;
  account_id: string;
  reference?: string;
  counterparty?: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeFingerprintText(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function bankStatementRowFingerprint(row: BankStatementCsvRow): string {
  return sha256(
    [
      row.date,
      row.direction,
      String(row.amount),
      row.account_id,
      normalizeFingerprintText(row.category),
      normalizeFingerprintText(row.reference),
      normalizeFingerprintText(row.description),
      normalizeFingerprintText(row.counterparty),
    ].join("|")
  );
}

export function bankStatementBatchFingerprint(
  rows: BankStatementCsvRow[],
  adapter = "generic-csv"
): string {
  return sha256(
    `${adapter}\n${rows.map(bankStatementRowFingerprint).sort().join("\n")}`
  );
}

const CSV_HEADER = [
  "date",
  "direction",
  "amount",
  "category",
  "description",
  "account_id",
  "reference",
  "counterparty",
] as const;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeDirection(value: string): "inflow" | "outflow" {
  const normalized = value.trim().toLowerCase();
  if (["inflow", "in", "deposit", "入金"].includes(normalized)) return "inflow";
  if (["outflow", "out", "withdrawal", "出金"].includes(normalized)) return "outflow";
  throw new Error(`Invalid direction "${value}" — use inflow/outflow`);
}

export function parseBankStatementCsv(content: string): BankStatementCsvRow[] {
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]!).map((cell) => cell.toLowerCase());
  const hasHeader = header.includes("date") && header.includes("amount");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const columnIndex = (name: (typeof CSV_HEADER)[number]): number => {
    const index = header.indexOf(name);
    return index >= 0 ? index : CSV_HEADER.indexOf(name);
  };

  return dataLines.map((line, index) => {
    const cells = parseCsvLine(line);
    const get = (name: (typeof CSV_HEADER)[number]): string => {
      const value = hasHeader ? cells[columnIndex(name)] : cells[CSV_HEADER.indexOf(name)];
      if (value == null || value === "") {
        throw new Error(`Row ${index + 1}: missing ${name}`);
      }
      return value;
    };
    const amount = Number(get("amount").replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Row ${index + 1}: amount must be positive`);
    }
    return {
      date: get("date"),
      direction: normalizeDirection(get("direction")),
      amount,
      category: get("category"),
      description: get("description"),
      account_id: get("account_id"),
      reference: cells[columnIndex("reference")] || undefined,
      counterparty: cells[columnIndex("counterparty")] || undefined,
    };
  });
}

export function buildBankStatementEntries(
  rows: BankStatementCsvRow[],
  options: {
    importBatchId?: string;
    chartOfAccounts?: ChartOfAccounts;
    defaultAccountId?: string;
    adapter?: string;
    importedAt?: string;
    openingBalance?: number;
    closingBalance?: number;
  } = {}
): {
  entries: BankStatementEntry[];
  batch: BankStatementImportBatch;
  warnings: string[];
} {
  if (rows.length === 0) {
    throw new Error("Bank statement CSV contains no data rows");
  }
  const warnings: string[] = [];
  const adapter = options.adapter ?? "generic-csv";
  const batchFingerprint = bankStatementBatchFingerprint(rows, adapter);
  const batchId =
    options.importBatchId ?? `BANK-IMPORT-${batchFingerprint.slice(0, 16)}`;
  const defaultAccountId = options.defaultAccountId ?? resolveDefaultAccountId();
  const entries: BankStatementEntry[] = [];
  for (const [index, row] of rows.entries()) {
    const fingerprint = bankStatementRowFingerprint(row);
    const resolved = options.chartOfAccounts
      ? resolveChartAccountId(
          {
            category: row.category,
            direction: row.direction,
          },
          options.chartOfAccounts
        )
      : { chart_account_id: undefined, warning: undefined };
    if (resolved.warning) warnings.push(`row ${index + 1}: ${resolved.warning}`);
    const accountId = row.account_id || defaultAccountId;
    if (!accountId) {
      warnings.push(`row ${index + 1}: missing account_id (configure payment calendar or cash-balance)`);
      continue;
    }
    entries.push({
      id: `BANK-${fingerprint.slice(0, 20)}`,
      fingerprint,
      date: row.date,
      direction: row.direction,
      amount: row.amount,
      category: row.category,
      description: row.description,
      account_id: accountId,
      chart_account_id: resolved.chart_account_id,
      reference: row.reference,
      counterparty: row.counterparty,
      import_batch_id: batchId,
      status: "unmatched" as const,
      source: "import" as const,
    });
  }
  const dates = rows.map((row) => row.date).sort();
  const accounts = [...new Set(entries.map((entry) => entry.account_id))];
  const batch: BankStatementImportBatch = {
    id: batchId,
    fingerprint: batchFingerprint,
    imported_at: options.importedAt ?? new Date().toISOString(),
    adapter,
    account_id: accounts.length === 1 ? accounts[0] : undefined,
    period_start: dates[0],
    period_end: dates.at(-1),
    opening_balance: options.openingBalance,
    closing_balance: options.closingBalance,
    entry_ids: entries.map((entry) => entry.id).sort(),
  };
  return { entries, batch, warnings };
}

export function mergeBankStatementEntries(
  file: BankStatementFile,
  incoming: BankStatementEntry[],
  batch?: BankStatementImportBatch
): { file: BankStatementFile; added: number; duplicate_batch: boolean } {
  const byId = new Map(file.entries.map((entry) => [entry.id, entry]));
  const duplicateBatch = Boolean(
    batch &&
      file.import_batches.some(
        (existing) =>
          existing.id === batch.id || existing.fingerprint === batch.fingerprint
      )
  );
  if (duplicateBatch) {
    return { file, added: 0, duplicate_batch: true };
  }
  const additions = incoming.filter((entry) => {
    const existing = byId.get(entry.id);
    if (existing) {
      if (
        existing.fingerprint !== entry.fingerprint ||
        existing.amount !== entry.amount ||
        existing.direction !== entry.direction
      ) {
        throw new Error(`Bank statement id conflict: ${entry.id}`);
      }
      return false;
    }
    byId.set(entry.id, entry);
    return true;
  });
  return {
    file: {
      ...file,
      as_of: currentDate(),
      import_batches: batch
        ? [...file.import_batches, batch].sort((a, b) => a.id.localeCompare(b.id))
        : file.import_batches,
      entries: [...file.entries, ...additions].sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
      ),
    },
    added: additions.length,
    duplicate_batch: false,
  };
}

export function readBankStatementCsvFile(path: string): BankStatementCsvRow[] {
  return parseBankStatementCsv(readFileSync(path, "utf-8"));
}
