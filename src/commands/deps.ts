import {
  loadDependencyGraph,
  computeImpact,
  findStaleDependencies,
  formatImpactMarkdown,
  formatGraphSummaryMarkdown,
} from "../lib/dependency-graph.js";
import { writeMarkdownReport } from "../lib/utils.js";
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";

export interface DepsCheckOptions {
  file?: string;
  markdown?: boolean;
  output?: string;
}

export function runDepsCheck(opts: DepsCheckOptions = {}): void {
  const graph = loadDependencyGraph();

  if (!opts.file) {
    console.log("変更ファイルを指定してください: steward deps check --file <path>");
    console.log("全ファイルの鮮度確認: npm run validate -- --deps");
    process.exit(1);
  }

  const { sources, impacts } = computeImpact(graph, opts.file);

  if (opts.markdown || opts.output) {
    const md = formatImpactMarkdown(opts.file, sources, impacts);
    if (opts.output) {
      requireCliReportWrite("deps check");
      const path = writeMarkdownReport("deps", opts.output, md);
      console.log(`Saved: ${path}`);
    } else {
      console.log(md);
    }
    process.exit(sources.length === 0 ? 1 : 0);
  }

  if (sources.length === 0) {
    console.log(`✗ 依存グラフに一致するノードがありません: ${opts.file}`);
    process.exit(1);
  }

  console.log(`影響チェック: ${opts.file}`);
  console.log("");
  console.log("【変更元】");
  for (const s of sources) {
    console.log(`  • ${s.label} (${s.id})`);
  }

  if (impacts.length === 0) {
    console.log("\n下流の依存は定義されていません。");
    process.exit(0);
  }

  console.log("\n【確認・更新が必要な項目】");
  for (const item of impacts) {
    const pathHint = item.path ? ` → ${item.path}` : "";
    console.log(
      `  [${item.action}] ${item.label}${pathHint}\n` +
        `         ${item.edgeCategory}: ${item.reason}`
    );
  }

  console.log("\n推奨:");
  console.log("  npm run validate");
  if (impacts.some((i) => i.action === "sync")) {
    console.log("  npm run orgos -- sync all");
  }
  if (impacts.some((i) => i.nodeId.includes("dashboard"))) {
    console.log("  npm run orgos -- dashboard");
  }
}

export function runDepsGraph(opts: { output?: string } = {}): void {
  const graph = loadDependencyGraph();
  const md = formatGraphSummaryMarkdown(graph);

  if (opts.output) {
    requireCliReportWrite("deps graph");
    const path = writeMarkdownReport("deps", opts.output, md);
    console.log(`Saved: ${path}`);
  } else {
    console.log(md);
  }
}

export function runImpact(path: string, opts: DepsCheckOptions = {}): void {
  runDepsCheck({ ...opts, file: path });
}

export function printStaleDependencyWarnings(): number {
  const graph = loadDependencyGraph();
  const stale = findStaleDependencies(graph);

  if (stale.length === 0) return 0;

  console.log(`\n⚠ ${stale.length} 件の依存鮮度警告（ソースより下流が古い）:`);
  for (const s of stale) {
    console.log(`  ${s.source} → ${s.target}`);
    console.log(`    ${s.reason}`);
  }
  return stale.length;
}
