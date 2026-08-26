import {
  collectCapitalRaiseIrCrossCheckIssues,
  formatCapitalRaiseCrossCheckMarkdown,
} from "../lib/investor-relations/capital-raise-crosscheck.js";
import { loadIrCapTable } from "../lib/investor-relations/load.js";

export function runFinancesCapitalRaiseCrossCheck(opts: { json?: boolean } = {}): void {
  const loaded = loadIrCapTable();
  const issues = collectCapitalRaiseIrCrossCheckIssues(loaded?.data ?? null);
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ir_cap_table: loaded?.path ?? null,
          issue_count: issues.length,
          issues,
        },
        null,
        2,
      ),
    );
    if (issues.some((issue) => issue.level === "error")) process.exitCode = 1;
    return;
  }

  if (!loaded) {
    console.log("IR cap-table.yaml がテナントにありません。クロスチェック対象なし。");
    console.log("有効化: `orgos modules activate investor_relations`");
    return;
  }

  console.log(formatCapitalRaiseCrossCheckMarkdown(issues));
  if (issues.some((issue) => issue.level === "error")) process.exitCode = 1;
}
