/**
 * Tax filing gaps overlay — load and summarize open items.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TaxFilingGapItem, TaxFilingGaps } from "../../../schemas/finance/tax-filing-gaps.js";
import { loadTaxFilingGaps } from "../data.js";
import { getDataDir } from "../utils.js";

export function taxFilingGapsPath(): string {
  return join(getDataDir(), "finance", "tax-filing-gaps.yaml");
}

export function taxFilingGapsAvailable(): boolean {
  return existsSync(taxFilingGapsPath());
}

export function tryLoadTaxFilingGaps(): TaxFilingGaps | null {
  if (!taxFilingGapsAvailable()) return null;
  try {
    return loadTaxFilingGaps();
  } catch {
    return null;
  }
}

export function listOpenTaxFilingGaps(
  gaps: TaxFilingGaps | null = tryLoadTaxFilingGaps(),
): TaxFilingGapItem[] {
  if (!gaps) return [];
  return gaps.gaps.filter((g) => g.status === "open" || g.status === "deferred");
}

export function summarizeTaxFilingGaps(
  gaps: TaxFilingGaps | null = tryLoadTaxFilingGaps(),
): {
  total: number;
  open: number;
  deferred: number;
  resolved: number;
  blocking: number;
  warning: number;
  advisor_pending: number;
  items: TaxFilingGapItem[];
} {
  const all = gaps?.gaps ?? [];
  const items = listOpenTaxFilingGaps(gaps);
  const openItems = items.filter((g) => g.status === "open");
  return {
    total: all.length,
    open: openItems.length,
    deferred: items.filter((g) => g.status === "deferred").length,
    resolved: all.filter((g) => g.status === "resolved").length,
    blocking: openItems.filter((g) => g.severity === "blocking").length,
    warning: openItems.filter((g) => g.severity === "warning").length,
    advisor_pending: items.filter(
      (g) => g.status === "deferred" && g.handoff === "tax_advisor",
    ).length,
    items,
  };
}

export function formatTaxFilingGapsBriefLines(
  gaps: TaxFilingGaps | null = tryLoadTaxFilingGaps(),
  limit = 5,
): string[] {
  const summary = summarizeTaxFilingGaps(gaps);
  if (summary.open === 0 && summary.items.length === 0) {
    return ["申告準備ギャップ: 未登録または open なし"];
  }
  const lines = [
    `申告準備ギャップ: open ${summary.open} 件 · deferred ${summary.deferred} 件（blocking ${summary.blocking} · warning ${summary.warning}）`,
  ];
  for (const g of summary.items.slice(0, limit)) {
    const tag = g.status === "deferred" ? "deferred" : g.severity;
    lines.push(`- [${tag}] ${g.area}: ${g.message}`);
  }
  return lines;
}
