import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Contract } from "../../schemas/index.js";
import {
  loadContracts,
  loadRevenuePlan,
  loadExpensePlan,
  loadProfitPlan,
  loadInvestmentPlan,
} from "./data.js";
import { getDocsDir } from "./utils.js";

function csvEscape(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(path: string, header: string[], rows: (string | number | undefined | null)[][]): string {
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  const content = lines.join("\n") + "\n";
  writeFileSync(path, content, "utf-8");
  return path;
}

function contractRow(c: Contract): (string | number | undefined | null)[] {
  const comp = c.compensation;
  return [
    c.id,
    c.name,
    c.counterparty,
    c.counterparty_type ?? "",
    c.type,
    c.status,
    c.start_date,
    c.end_date ?? "",
    c.executed_date ?? "",
    c.property_id ?? "",
    comp?.type ?? "",
    comp?.amount ?? "",
    comp?.payment_terms ?? "",
    c.auto_renewal ? "true" : "false",
    c.owner ?? "",
    c.risk?.risk_level ?? "",
    c.documents?.draft ?? "",
    c.documents?.executed ?? c.documents?.enrollment ?? "",
    (c.notes ?? "").replace(/\n/g, " ").slice(0, 120),
  ];
}

export function syncContractsCsv(): string {
  const contracts = loadContracts().sort((a, b) => a.id.localeCompare(b.id));
  const path = join(getDocsDir(), "data", "契約管理表.csv");
  return writeCsv(
    path,
    [
      "contract_id",
      "name",
      "counterparty",
      "counterparty_type",
      "type",
      "status",
      "start_date",
      "end_date",
      "executed_date",
      "property_id",
      "compensation_type",
      "compensation_amount_tax_included",
      "payment_terms",
      "auto_renewal",
      "owner",
      "risk_level",
      "draft_doc",
      "executed_doc",
      "notes",
    ],
    contracts.map(contractRow)
  );
}

export function syncRevenueCsv(): string {
  const plan = loadRevenuePlan();
  const rows: (string | number | undefined | null)[][] = [];
  for (const y of plan.years) {
    for (const line of y.lines) {
      rows.push([
        y.fiscal_year,
        y.period_from,
        y.period_to,
        line.id,
        line.name,
        line.property_id ?? "",
        line.amount,
        line.notes ?? "",
      ]);
    }
  }
  return writeCsv(
    join(getDocsDir(), "data", "売上計画.csv"),
    ["fiscal_year", "period_from", "period_to", "line_id", "line_name", "property_id", "amount_jpy", "notes"],
    rows
  );
}

export function syncExpenseCsv(): string {
  const plan = loadExpensePlan();
  const rows: (string | number | undefined | null)[][] = [];
  for (const y of plan.years) {
    for (const line of y.lines) {
      rows.push([
        y.fiscal_year,
        y.period_from,
        y.period_to,
        line.id,
        line.name,
        line.property_id ?? "",
        line.amount,
        line.notes ?? "",
      ]);
    }
  }
  return writeCsv(
    join(getDocsDir(), "data", "費用計画.csv"),
    ["fiscal_year", "period_from", "period_to", "line_id", "line_name", "property_id", "amount_jpy", "notes"],
    rows
  );
}

export function syncProfitCsv(): string {
  const plan = loadProfitPlan();
  const rows = plan.years.map((y) => [
    y.fiscal_year,
    y.period_from,
    y.period_to,
    y.revenue,
    y.gross_profit,
    y.sga,
    y.operating_profit,
    y.pretax_profit,
    y.tax ?? "",
    y.net_profit ?? "",
    y.status,
    y.notes ?? "",
  ]);
  return writeCsv(
    join(getDocsDir(), "data", "利益計画.csv"),
    [
      "fiscal_year",
      "period_from",
      "period_to",
      "revenue_jpy",
      "gross_profit_jpy",
      "sga_jpy",
      "operating_profit_jpy",
      "pretax_profit_jpy",
      "tax_jpy",
      "net_profit_jpy",
      "status",
      "notes",
    ],
    rows
  );
}

export function syncInvestmentCsv(): string {
  const plan = loadInvestmentPlan();
  const rows: (string | number | undefined | null)[][] = [];
  for (const y of plan.years) {
    for (const item of y.items) {
      rows.push([
        y.fiscal_year,
        y.period_from,
        y.period_to,
        item.id,
        item.name,
        item.property_id ?? "",
        item.month ?? "",
        item.amount,
        item.notes ?? "",
      ]);
    }
  }
  return writeCsv(
    join(getDocsDir(), "data", "投資計画.csv"),
    ["fiscal_year", "period_from", "period_to", "item_id", "item_name", "property_id", "month", "amount_jpy", "notes"],
    rows
  );
}

export interface SyncResult {
  contracts: string;
  revenue: string;
  expense: string;
  profit: string;
  investment: string;
}

export function syncAllCsv(): SyncResult {
  return {
    contracts: syncContractsCsv(),
    revenue: syncRevenueCsv(),
    expense: syncExpenseCsv(),
    profit: syncProfitCsv(),
    investment: syncInvestmentCsv(),
  };
}
