import type { CapTableFile, CapTableLine } from "../../../schemas/investor-relations/index.js";

export interface CapTableReviewIssue {
  level: "error" | "warning";
  message: string;
}

export interface CapTableReviewResult {
  ok: boolean;
  line_count: number;
  fully_diluted_total_pct: number;
  issues: CapTableReviewIssue[];
}

const PCT_TOLERANCE = 0.5;

export function reviewCapTable(file: CapTableFile): CapTableReviewResult {
  const issues: CapTableReviewIssue[] = [];
  const seenHolders = new Set<string>();

  for (const line of file.lines) {
    pushLineIssues(line, seenHolders, issues);
  }

  const totalPct = roundPct(
    file.lines.reduce((sum, line) => sum + line.fully_diluted_pct, 0),
  );

  if (file.lines.length > 0 && Math.abs(totalPct - 100) > PCT_TOLERANCE) {
    issues.push({
      level: "error",
      message: `fully_diluted_pct total is ${totalPct}% (expected ~100%)`,
    });
  }

  if (file.lines.length === 0) {
    issues.push({
      level: "warning",
      message: "cap table has no lines",
    });
  }

  const errors = issues.filter((i) => i.level === "error");
  return {
    ok: errors.length === 0,
    line_count: file.lines.length,
    fully_diluted_total_pct: totalPct,
    issues,
  };
}

function pushLineIssues(
  line: CapTableLine,
  seenHolders: Set<string>,
  issues: CapTableReviewIssue[],
): void {
  const key = `${line.holder_ref}:${line.security_type}`;
  if (seenHolders.has(key)) {
    issues.push({
      level: "error",
      message: `duplicate holder/security ${key}`,
    });
  }
  seenHolders.add(key);

  if (!line.holder_ref.trim()) {
    issues.push({
      level: "error",
      message: "empty holder_ref",
    });
  }

  if (line.fully_diluted_pct < 0 || line.fully_diluted_pct > 100) {
    issues.push({
      level: "error",
      message: `${line.holder_ref}: fully_diluted_pct out of range`,
    });
  }
}

export function formatCapTableReviewMarkdown(result: CapTableReviewResult): string {
  const status = result.ok ? "OK" : "ISSUES";
  const lines = [
    `# Cap table review — ${status}`,
    "",
    `- lines: ${result.line_count}`,
    `- fully diluted total: ${result.fully_diluted_total_pct}%`,
    "",
  ];

  if (!result.issues.length) {
    lines.push("No issues.");
    return lines.join("\n");
  }

  lines.push("## Issues", "");
  for (const issue of result.issues) {
    lines.push(`- **${issue.level}**: ${issue.message}`);
  }
  return lines.join("\n");
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}
