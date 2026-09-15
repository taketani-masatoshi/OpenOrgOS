import {
  type IngestRule,
  type IngestRulesFile,
  type IngestStagingFile,
  type IngestStagingRow,
} from "../../../../schemas/finance/ingest.js";
import { loadIngestRules, loadIngestStaging, saveIngestStaging } from "./store.js";

function haystack(row: IngestStagingRow): string {
  return [row.payee, row.description, row.category_hint ?? ""]
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
}

function ruleMatches(rule: IngestRule, row: IngestStagingRow): boolean {
  if (rule.match.source_kind && rule.match.source_kind !== row.source_kind) return false;
  if (rule.match.direction && rule.match.direction !== row.direction) return false;
  if (rule.match.contains) {
    const needle = rule.match.contains.normalize("NFKC").toLowerCase();
    if (!haystack(row).includes(needle)) return false;
  }
  return Boolean(rule.match.contains || rule.match.source_kind || rule.match.direction);
}

export function pickRule(
  rules: IngestRulesFile,
  row: IngestStagingRow,
): IngestRule | null {
  const sorted = [...rules.rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    if (ruleMatches(rule, row)) return rule;
  }
  return null;
}

export type ClassifyResult = {
  classified: number;
  needs_review: number;
  unchanged: number;
  dry_run: boolean;
};

export function classifyIngestStaging(input?: { write?: boolean }): ClassifyResult {
  const rules = loadIngestRules();
  const staging = loadIngestStaging();
  let classified = 0;
  let needs_review = 0;
  let unchanged = 0;

  const nextRows = staging.rows.map((row) => {
    if (row.status === "posted" || row.status === "skipped") {
      unchanged += 1;
      return row;
    }
    if (row.source_kind === "contracts") {
      needs_review += 1;
      return {
        ...row,
        status: "needs_review" as const,
        review_notes: [
          ...row.review_notes,
          "契約は仕訳対象外 — Contract Agent で CTR YAML を起票",
        ],
      };
    }
    const rule = pickRule(rules, row);
    if (rule) {
      classified += 1;
      return {
        ...row,
        account_code: rule.account_code,
        cash_account_code:
          rule.cash_account_code ?? rules.default_cash_account_code,
        tax_category: rule.tax_category ?? row.tax_category,
        business_pct: rule.business_pct ?? row.business_pct ?? 100,
        status: "classified" as const,
        review_notes: row.review_notes.filter((n) => !n.startsWith("unclassified")),
      };
    }
    // Sales inflow default revenue
    if (row.direction === "inflow" && row.source_kind === "sales") {
      classified += 1;
      return {
        ...row,
        account_code: rules.default_revenue_account_code,
        cash_account_code: rules.default_cash_account_code,
        tax_category: row.tax_category ?? "taxable_10",
        business_pct: 100,
        status: "classified" as const,
      };
    }
    needs_review += 1;
    return {
      ...row,
      status: "needs_review" as const,
      review_notes: [
        ...row.review_notes.filter((n) => !n.startsWith("unclassified")),
        "unclassified: ingest-rules.yaml に一致ルールなし",
      ],
    };
  });

  if (input?.write) {
    saveIngestStaging({ ...staging, rows: nextRows } satisfies IngestStagingFile);
  }

  return {
    classified,
    needs_review,
    unchanged,
    dry_run: !input?.write,
  };
}
