import { readFileSync } from "node:fs";
import type {
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
  } = {}
): { entries: BankStatementEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const batchId = options.importBatchId ?? `BANK-IMPORT-${currentDate()}`;
  const defaultAccountId = options.defaultAccountId ?? resolveDefaultAccountId();
  const entries = rows.map((row, index) => {
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
    return {
      id: `BANK-${row.date.replace(/-/g, "")}-${String(index + 1).padStart(3, "0")}`,
      date: row.date,
      direction: row.direction,
      amount: row.amount,
      category: row.category,
      description: row.description,
      account_id: row.account_id || defaultAccountId,
      chart_account_id: resolved.chart_account_id,
      reference: row.reference,
      counterparty: row.counterparty,
      import_batch_id: batchId,
      status: "unmatched" as const,
      source: "import" as const,
    };
  });
  return { entries, warnings };
}

export function mergeBankStatementEntries(
  file: BankStatementFile,
  incoming: BankStatementEntry[]
): { file: BankStatementFile; added: number } {
  const ids = new Set(file.entries.map((entry) => entry.id));
  const additions = incoming.filter((entry) => {
    if (ids.has(entry.id)) return false;
    ids.add(entry.id);
    return true;
  });
  return {
    file: {
      ...file,
      as_of: currentDate(),
      entries: [...file.entries, ...additions].sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
      ),
    },
    added: additions.length,
  };
}

export function readBankStatementCsvFile(path: string): BankStatementCsvRow[] {
  return parseBankStatementCsv(readFileSync(path, "utf-8"));
}
