/**
 * L1 cash counterparties from AR/AP + bank statements.
 * Names and amounts only — never emit account numbers or other L2 fields.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  arApLedgerFileSchema,
  bankStatementFileSchema,
} from "../../schemas/jp-bank-corporate.js";
import { loadCompany } from "./data.js";
import { getDataDir, readYamlFile } from "./utils.js";

export type CashCounterpartyCoverage = "registered" | "unregistered";

export interface CashCounterpartyRow {
  name: string;
  inflow_yen: number;
  outflow_yen: number;
  sources: Array<"ar" | "ap" | "bank">;
}

export interface CashCounterpartiesView {
  company_name: string;
  coverage: CashCounterpartyCoverage;
  counterparties: CashCounterpartyRow[];
}

function normalizeName(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function loadOptionalYaml<T>(
  rel: string,
  parse: (path: string) => T
): T | undefined {
  const path = join(getDataDir(), rel);
  if (!existsSync(path)) return undefined;
  try {
    return parse(path);
  } catch {
    return undefined;
  }
}

function upsert(
  byName: Map<string, CashCounterpartyRow>,
  name: string,
  patch: { inflow?: number; outflow?: number; source: CashCounterpartyRow["sources"][number] }
): void {
  const key = normalizeName(name);
  if (!key) return;
  const row = byName.get(key) ?? {
    name: key,
    inflow_yen: 0,
    outflow_yen: 0,
    sources: [],
  };
  row.inflow_yen += patch.inflow ?? 0;
  row.outflow_yen += patch.outflow ?? 0;
  if (!row.sources.includes(patch.source)) row.sources.push(patch.source);
  byName.set(key, row);
}

export function buildCashCounterpartiesView(): CashCounterpartiesView {
  const company = loadCompany();
  const byName = new Map<string, CashCounterpartyRow>();

  const ledger = loadOptionalYaml("finance/ar-ap-ledger.yaml", (path) =>
    readYamlFile(path, arApLedgerFileSchema)
  );
  for (const entry of ledger?.entries ?? []) {
    if (entry.status === "cancelled") continue;
    if (entry.kind === "ar") {
      upsert(byName, entry.counterparty, { inflow: entry.amount, source: "ar" });
    } else {
      upsert(byName, entry.counterparty, { outflow: entry.amount, source: "ap" });
    }
  }

  const bank = loadOptionalYaml("finance/bank-statements.yaml", (path) =>
    readYamlFile(path, bankStatementFileSchema)
  );
  for (const entry of bank?.entries ?? []) {
    if (!entry.counterparty?.trim()) continue;
    if (entry.direction === "inflow") {
      upsert(byName, entry.counterparty, { inflow: entry.amount, source: "bank" });
    } else {
      upsert(byName, entry.counterparty, { outflow: entry.amount, source: "bank" });
    }
  }

  const counterparties = [...byName.values()].sort((a, b) => {
    const aIn = a.inflow_yen > 0 ? 0 : 1;
    const bIn = b.inflow_yen > 0 ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return a.name.localeCompare(b.name, "ja");
  });

  return {
    company_name: company.name,
    coverage: counterparties.length > 0 ? "registered" : "unregistered",
    counterparties,
  };
}

function namesOf(
  rows: CashCounterpartyRow[],
  pred: (row: CashCounterpartyRow) => boolean
): string[] {
  return rows.filter(pred).map((row) => row.name);
}

/** Short CEO-facing reply — names only, no Path / CLI. */
export function formatCashCounterpartiesCeoReply(view: CashCounterpartiesView): string {
  if (view.coverage === "unregistered" || view.counterparties.length === 0) {
    return "入出金の台帳に相手先はまだありません。";
  }
  const inflow = namesOf(view.counterparties, (row) => row.inflow_yen > 0);
  const outflow = namesOf(view.counterparties, (row) => row.outflow_yen > 0);
  const lines = [`入出金のある相手は ${view.counterparties.length} 先です。`];
  if (inflow.length > 0) lines.push(`入金: ${inflow.join("、")}`);
  if (outflow.length > 0) lines.push(`出金: ${outflow.join("、")}`);
  return lines.join("\n");
}

export function formatCashCounterpartiesTodayLines(view: CashCounterpartiesView): string[] {
  if (view.coverage === "unregistered") {
    return ["- 入出金相手: 未登録"];
  }
  const inflow = namesOf(view.counterparties, (row) => row.inflow_yen > 0);
  const outflow = namesOf(view.counterparties, (row) => row.outflow_yen > 0);
  return [
    `- 入金: ${inflow.join("、") || "なし"}`,
    `- 出金: ${outflow.join("、") || "なし"}`,
  ];
}
