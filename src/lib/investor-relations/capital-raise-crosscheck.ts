import type { CapTableFile } from "../../../schemas/investor-relations/index.js";
import type { CapitalRaiseCase } from "../../../schemas/finance/capital-raise-case.js";
import { loadCapitalRaiseCasesFile } from "../data.js";

/** Stages where the case cap table is expected to be reflected in IR SSOT. */
const ACTIVE_RAISE_STAGES = new Set<CapitalRaiseCase["stage"]>([
  "diligence",
  "term_sheet",
  "closing",
  "closed",
]);

/** Percent drift above this between the two sources is reported. */
const PCT_DRIFT_TOLERANCE = 0.5;

export interface CapitalRaiseCrossCheckIssue {
  level: "warning" | "error";
  message: string;
}

export function collectCapitalRaiseIrCrossCheckIssues(
  irCapTable: CapTableFile | null,
  opts: { cases?: CapitalRaiseCase[] } = {},
): CapitalRaiseCrossCheckIssue[] {
  if (!irCapTable) return [];

  const cases = opts.cases ?? loadActiveCases();
  if (!cases.length) return [];

  const irByHolder = new Map(
    irCapTable.lines.map((line) => [`${line.holder_ref}:${line.security_type}`, line]),
  );
  const irHolders = new Set(irCapTable.lines.map((line) => line.holder_ref));
  const issues: CapitalRaiseCrossCheckIssue[] = [];

  for (const raiseCase of cases) {
    if (!ACTIVE_RAISE_STAGES.has(raiseCase.stage)) continue;
    for (const line of raiseCase.cap_table) {
      if (!irHolders.has(line.holder_ref)) {
        issues.push({
          level: raiseCase.stage === "closed" ? "error" : "warning",
          message: `capital-raise ${raiseCase.case_id} (${raiseCase.stage}): holder_ref ${line.holder_ref} missing from IR cap-table.yaml`,
        });
        continue;
      }

      const irLine = irByHolder.get(`${line.holder_ref}:${line.security_type}`);
      if (!irLine) {
        issues.push({
          level: "warning",
          message: `capital-raise ${raiseCase.case_id}: ${line.holder_ref} security_type ${line.security_type} not found in IR cap-table.yaml`,
        });
        continue;
      }

      const drift = Math.abs(irLine.fully_diluted_pct - line.fully_diluted_pct);
      if (drift > PCT_DRIFT_TOLERANCE) {
        issues.push({
          level: "warning",
          message: `capital-raise ${raiseCase.case_id}: ${line.holder_ref} fully_diluted_pct ${line.fully_diluted_pct}% differs from IR ${irLine.fully_diluted_pct}%`,
        });
      }
    }

    pushOverlappingTotalIssue(raiseCase, irByHolder, issues);
  }

  return issues;
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

function pushOverlappingTotalIssue(
  raiseCase: CapitalRaiseCase,
  irByHolder: Map<string, CapTableFile["lines"][number]>,
  issues: CapitalRaiseCrossCheckIssue[],
): void {
  if (!raiseCase.cap_table.length) return;

  const raiseTotal = roundPct(
    raiseCase.cap_table.reduce((sum, line) => sum + line.fully_diluted_pct, 0),
  );
  let overlapTotal = 0;
  let matched = 0;
  for (const line of raiseCase.cap_table) {
    const irLine = irByHolder.get(`${line.holder_ref}:${line.security_type}`);
    if (!irLine) continue;
    overlapTotal += irLine.fully_diluted_pct;
    matched += 1;
  }
  overlapTotal = roundPct(overlapTotal);
  if (matched === 0) return;
  if (Math.abs(raiseTotal - overlapTotal) <= PCT_DRIFT_TOLERANCE) return;

  issues.push({
    level: raiseCase.stage === "closed" ? "error" : "warning",
    message: `capital-raise ${raiseCase.case_id}: overlapping fully_diluted_pct total ${raiseTotal}% vs IR ${overlapTotal}%`,
  });
}

export function formatCapitalRaiseCrossCheckMarkdown(
  issues: CapitalRaiseCrossCheckIssue[],
): string {
  if (!issues.length) {
    return "## Capital raise cross-check\n\nNo drift against `data/finance/capital-raise-cases.yaml`.";
  }
  return [
    "## Capital raise cross-check",
    "",
    ...issues.map((issue) => `- **${issue.level}**: ${issue.message}`),
  ].join("\n");
}

function loadActiveCases(): CapitalRaiseCase[] {
  try {
    return loadCapitalRaiseCasesFile()?.cases ?? [];
  } catch {
    return [];
  }
}
