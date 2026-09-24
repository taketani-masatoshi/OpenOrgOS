/**
 * Inventory / COGS monthly-close gate (extracted from monthly-close-gates).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { getDataDir } from "../utils.js";
import { buildTrialBalance } from "./ledger/trial-balance.js";
import type { MonthlyCloseGate, MonthlyCloseGateLevel } from "./monthly-close-gates.js";

function gate(
  id: string,
  label: string,
  pass: boolean,
  level: MonthlyCloseGateLevel,
  detail?: string,
): MonthlyCloseGate {
  return { id, label, pass, level, ...(detail ? { detail } : {}) };
}

export function evaluateInventoryCloseGate(month: string, asOf: string): MonthlyCloseGate {
  const path = join(getDataDir(), "finance", "inventory.yaml");
  if (!existsSync(path)) {
    return gate("inventory-cogs", "棚卸と売上原価", true, "skip", "no inventory");
  }
  let months: Array<{
    month?: string;
    account_code?: string;
    ending_inventory_yen?: number;
    cogs_account_code?: string;
    cogs_yen?: number;
  }> = [];
  try {
    const raw = YAML.parse(readFileSync(path, "utf-8")) as {
      months?: typeof months;
    };
    months = raw?.months ?? [];
  } catch (error) {
    return gate(
      "inventory-cogs",
      "棚卸と売上原価",
      false,
      "error",
      error instanceof Error ? error.message : "inventory unreadable",
    );
  }
  const row = months.find((item) => item.month === month);
  if (!row?.account_code || row.ending_inventory_yen == null) {
    return gate("inventory-cogs", "棚卸と売上原価", false, "error", "inventory count missing");
  }
  const trial = buildTrialBalance({ asOf });
  const inventory =
    trial.rows.find((item) => item.account_code === row.account_code)?.balance_yen ?? 0;
  if (inventory !== row.ending_inventory_yen) {
    return gate(
      "inventory-cogs",
      "棚卸と売上原価",
      false,
      "error",
      `inventory ${inventory} != ${row.ending_inventory_yen}`,
    );
  }
  if (row.cogs_account_code && row.cogs_yen != null) {
    const cogs = Math.abs(
      trial.rows.find((item) => item.account_code === row.cogs_account_code)?.balance_yen ?? 0,
    );
    if (cogs !== row.cogs_yen) {
      return gate(
        "inventory-cogs",
        "棚卸と売上原価",
        false,
        "error",
        `cogs ${cogs} != ${row.cogs_yen}`,
      );
    }
  }
  return gate("inventory-cogs", "棚卸と売上原価", true, "error", "ok");
}
