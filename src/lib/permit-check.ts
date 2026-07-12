import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadContracts } from "./data.js";
import { getDocsDir } from "./utils.js";

export interface PermitRow {
  docId: string;
  category: string;
  title: string;
  propertyId: string;
  contractId: string;
  expiryDate: string;
  status: string;
  notes: string;
}

export interface PermitCheckResult {
  rows: PermitRow[];
  draftInsurance: string[];
  pendingEnrollment: PermitRow[];
}

export function loadPermitIndex(): PermitRow[] {
  const path = join(getDocsDir(), "company", "licenses", "INDEX.csv");
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf-8");
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const rows: PermitRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    if (cols.length < 11) continue;
    rows.push({
      docId: cols[0],
      category: cols[1],
      title: cols[2],
      propertyId: cols[3],
      contractId: cols[4],
      expiryDate: cols[7] ?? "",
      status: cols[9],
      notes: cols[10] ?? "",
    });
  }
  return rows;
}

export function runPermitExpiryCheck(): PermitCheckResult {
  const rows = loadPermitIndex();
  const contracts = loadContracts();
  const draftInsurance = contracts
    .filter((c) => c.type === "insurance" && c.status === "draft")
    .map((c) => c.id);
  const pendingEnrollment = rows.filter(
    (r) => r.status === "pending_enrollment" || r.status === "pending"
  );
  return { rows, draftInsurance, pendingEnrollment };
}

export function formatPermitCheckReport(result: PermitCheckResult): string {
  const lines = ["# 許認可 · 保険チェック（permit_expiry_check）", "", "## 保険 CTR（draft）", ""];
  if (result.draftInsurance.length) {
    for (const id of result.draftInsurance) lines.push(`- **${id}** — 加入 · executed 化待ち`);
  } else {
    lines.push("- （なし）");
  }
  lines.push("", "## 許認可 INDEX（pending）", "");
  if (result.pendingEnrollment.length) {
    lines.push("| ID | タイトル | 状態 | CTR |");
    lines.push("|----|---------|------|-----|");
    for (const r of result.pendingEnrollment) {
      lines.push(`| ${r.docId} | ${r.title} | ${r.status} | ${r.contractId || "—"} |`);
    }
  } else {
    lines.push("（なし）");
  }
  return lines.join("\n");
}
