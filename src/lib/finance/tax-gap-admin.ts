/**
 * Tax filing gap admin — resolve / defer after tax advisor response.
 */
import type { TaxFilingGapItem, TaxFilingGaps } from "../../../schemas/finance/tax-filing-gaps.js";
import { taxFilingGapItemSchema } from "../../../schemas/finance/tax-filing-gaps.js";
import { loadTaxFilingGaps } from "../data.js";
import { taxFilingGapsPath } from "./tax-filing-gaps.js";
import { currentDate, writeYamlFile } from "../utils.js";

export type GapResolveStatus = "open" | "resolved" | "deferred";

export function updateTaxFilingGap(opts: {
  id: string;
  status: GapResolveStatus;
  notes?: string;
  as_of?: string;
}): TaxFilingGapItem {
  const gaps = loadTaxFilingGaps();
  const index = gaps.gaps.findIndex((g) => g.id === opts.id);
  if (index < 0) {
    throw new Error(`gap not found: ${opts.id}`);
  }

  const existing = gaps.gaps[index]!;
  const updated = taxFilingGapItemSchema.parse({
    ...existing,
    status: opts.status,
    notes: opts.notes
      ? existing.notes
        ? `${existing.notes} · ${opts.notes}`
        : opts.notes
      : existing.notes,
  });

  const next: TaxFilingGaps = {
    ...gaps,
    as_of: opts.as_of ?? currentDate(),
    gaps: [...gaps.gaps.slice(0, index), updated, ...gaps.gaps.slice(index + 1)],
  };

  writeYamlFile(taxFilingGapsPath(), next);
  return updated;
}

export function runTaxGapResolve(opts: {
  id: string;
  status: GapResolveStatus;
  notes?: string;
  json?: boolean;
}): void {
  const item = updateTaxFilingGap({
    id: opts.id,
    status: opts.status,
    notes: opts.notes,
  });

  if (opts.json) {
    console.log(JSON.stringify(item, null, 2));
    return;
  }

  console.log(`✓ gap ${item.id} → ${item.status}`);
  if (item.notes) console.log(`  notes: ${item.notes}`);
  console.log("  next: orgos tax gaps · orgos tax readiness · orgos skills run tax-filing-prep");
}
