export type ProjectLine = {
  project_code?: string;
  account_code: string;
  debit_yen: number;
  credit_yen: number;
};

export type AllocationRule = {
  account_code: string;
  project_code: string;
  ratio: number;
};

function applyAllocation(lines: ProjectLine[], rules: AllocationRule[]): ProjectLine[] {
  if (rules.length === 0) return lines;
  const allocated: ProjectLine[] = [];
  for (const line of lines) {
    if (line.project_code) {
      allocated.push(line);
      continue;
    }
    const matches = rules.filter((rule) => rule.account_code === line.account_code);
    if (matches.length === 0) {
      allocated.push(line);
      continue;
    }
    for (const rule of matches) {
      allocated.push({
        ...line,
        project_code: rule.project_code,
        debit_yen: Math.round(line.debit_yen * rule.ratio),
        credit_yen: Math.round(line.credit_yen * rule.ratio),
      });
    }
  }
  return allocated;
}

/** Net credit minus debit, grouped by project_code. Lines without a code are skipped. */
export function summarizeProjectPl(
  entries: Array<{ lines: ProjectLine[] }>,
  rules: AllocationRule[] = [],
): Array<{ project_code: string; net_yen: number }> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    for (const line of applyAllocation(entry.lines, rules)) {
      if (!line.project_code) continue;
      const net = line.credit_yen - line.debit_yen;
      totals.set(line.project_code, (totals.get(line.project_code) ?? 0) + net);
    }
  }
  return [...totals.entries()]
    .map(([project_code, net_yen]) => ({ project_code, net_yen }))
    .sort((a, b) => a.project_code.localeCompare(b.project_code));
}
