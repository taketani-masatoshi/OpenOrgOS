import { existsSync } from "node:fs";
import { loadAllData, loadCashBalance } from "./data.js";
import {
  getP0Audits,
  getP0CashBalanceConfig,
  getP0Contracts,
  getP0Records,
  getP0Secrets,
  resolveModuleSecretsPath,
  resolveRecordsProbePath,
  resolveTenantDocPath,
} from "./ops-config.js";

export interface P0Item {
  id: string;
  label: string;
  status: "open" | "in_progress" | "done";
  blocker: boolean;
  detail: string;
}

export function listP0Items(): P0Item[] {
  const data = loadAllData();
  const items: P0Item[] = [];

  for (const spec of getP0Contracts()) {
    const c = data.contracts.find((x) => x.id === spec.id);
    items.push({
      id: spec.id,
      label: c?.name ?? spec.id,
      status: c?.status === "executed" ? "done" : "open",
      blocker: spec.blocker,
      detail: c?.status === "executed" ? "executed" : "draft — 手続完了待ち",
    });
  }

  for (const spec of getP0Secrets()) {
    const secretsPath = resolveModuleSecretsPath(spec.module_id);
    const exists = secretsPath ? existsSync(secretsPath) : false;
    items.push({
      id: spec.item_id ?? `secrets-${spec.module_id}`,
      label: spec.label,
      status: exists ? "done" : "open",
      blocker: spec.blocker,
      detail: exists ? (spec.done_detail ?? "作成済") : (spec.missing_detail ?? "未作成"),
    });
  }

  const cashCfg = getP0CashBalanceConfig();
  if (cashCfg?.enabled !== false) {
    const cash = loadCashBalance();
    items.push({
      id: cashCfg?.item_id ?? "cash-balance",
      label: cashCfg?.label ?? "cash-balance.yaml 確定",
      status: cash?.status === "confirmed" ? "done" : cash ? "in_progress" : "open",
      blocker: cashCfg?.blocker ?? true,
      detail:
        cash?.status === "confirmed" ? "confirmed" : `status: ${cash?.status ?? "missing"}`,
    });
  }

  for (const spec of getP0Records()) {
    const recordsPath = resolveRecordsProbePath(spec.module_id, spec.probe_file);
    const exists = recordsPath ? existsSync(recordsPath) : false;
    items.push({
      id: spec.item_id ?? `ops-records-${spec.module_id}`,
      label: spec.label,
      status: exists ? "in_progress" : "open",
      blocker: spec.blocker,
      detail: exists
        ? (spec.in_progress_detail ?? "記録あり")
        : (spec.open_detail ?? "未作成"),
    });
  }

  for (const spec of getP0Audits()) {
    const auditPath = resolveTenantDocPath(spec.path);
    const exists = existsSync(auditPath);
    items.push({
      id: spec.id,
      label: spec.label,
      status: exists ? "done" : "open",
      blocker: spec.blocker,
      detail: exists ? (spec.done_detail ?? "完了") : (spec.open_detail ?? "未完了"),
    });
  }

  return items;
}

export function formatP0Report(): string {
  const items = listP0Items();
  const open = items.filter((i) => i.status !== "done" && i.blocker);
  const lines = [
    "P0 実手続サマリ",
    "",
    ...items.map(
      (i) =>
        `  [${i.status === "done" ? "✓" : i.status === "in_progress" ? "~" : " "}] ${i.id}: ${i.detail}`
    ),
  ];
  if (open.length) {
    lines.push("", `ブロッカー ${open.length} 件: ${open.map((i) => i.id).join(", ")}`);
  }
  return lines.join("\n");
}
