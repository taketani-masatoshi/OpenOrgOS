import { existsSync, statSync } from "node:fs";
import { join, relative, resolve, basename } from "node:path";
import {
  dependencyGraphSchema,
  type DependencyGraph,
  type DependencyNode,
  type DependencyEdge,
  type EdgeCategory,
  type DependencyAction,
} from "../../schemas/dependency-graph.js";
import { ROOT_DIR, DATA_DIR, readYamlFile } from "./utils.js";

export const DEPENDENCY_GRAPH_PATH = join(DATA_DIR, "dependency-graph.yaml");

export interface ImpactItem {
  nodeId: string;
  label: string;
  category: DependencyNode["category"];
  path?: string;
  action: DependencyAction;
  reason: string;
  edgeCategory: EdgeCategory;
  depth: number;
}

export interface StaleItem {
  source: string;
  target: string;
  reason: string;
  sourceMtime: Date;
  targetMtime: Date;
}

export function loadDependencyGraph(): DependencyGraph {
  return readYamlFile(DEPENDENCY_GRAPH_PATH, dependencyGraphSchema);
}

function normalizePath(input: string): string {
  const abs = resolve(ROOT_DIR, input);
  return relative(ROOT_DIR, abs).replace(/\\/g, "/");
}

function nodePaths(node: DependencyNode): string[] {
  const paths = new Set<string>();
  if (node.path) paths.add(normalizePath(node.path));
  if (node.category === "file" && !node.path) paths.add(normalizePath(node.id));
  return [...paths];
}

function buildNodeIndex(graph: DependencyGraph): Map<string, DependencyNode> {
  const index = new Map<string, DependencyNode>();
  for (const node of graph.nodes) {
    index.set(node.id, node);
    for (const alias of node.aliases ?? []) {
      index.set(alias, node);
    }
  }
  return index;
}

function buildAdjacency(graph: DependencyGraph): Map<string, DependencyEdge[]> {
  const adj = new Map<string, DependencyEdge[]>();
  for (const edge of graph.edges) {
    const list = adj.get(edge.from) ?? [];
    list.push(edge);
    adj.set(edge.from, list);
  }
  return adj;
}

/** 変更ファイルまたはノード ID に一致する起点ノードを返す */
export function resolveSourceNodes(graph: DependencyGraph, input: string): DependencyNode[] {
  const normalized = normalizePath(input);
  const base = basename(normalized);
  const idOnly = base.replace(/\.yaml$/, "");

  const matched = new Set<DependencyNode>();

  for (const node of graph.nodes) {
    if (node.id === input || node.id === idOnly || node.id === normalized) {
      matched.add(node);
    }
    for (const p of nodePaths(node)) {
      if (p === normalized || normalized.endsWith(`/${p}`) || p.endsWith(`/${normalized}`)) {
        matched.add(node);
      }
    }
    for (const alias of node.aliases ?? []) {
      if (alias === input || alias === idOnly || alias === normalized) {
        matched.add(node);
      }
    }
    // ファイル編集時、同一 path の parameter ノードも起点に含める
    if (node.category === "parameter" && node.path && normalizePath(node.path) === normalized) {
      matched.add(node);
    }
  }

  // 契約・物件 ID からの部分一致（例: CTR-008 → data/contracts/CTR-008.yaml）
  if (matched.size === 0) {
    for (const node of graph.nodes) {
      if (node.id.includes(idOnly) || (node.path && normalizePath(node.path).includes(idOnly))) {
        matched.add(node);
      }
    }
  }

  return [...matched];
}

/** 起点から下流ノードへの影響を BFS で列挙 */
export function computeImpact(
  graph: DependencyGraph,
  input: string
): { sources: DependencyNode[]; impacts: ImpactItem[] } {
  const nodeIndex = buildNodeIndex(graph);
  const adjacency = buildAdjacency(graph);
  const sources = resolveSourceNodes(graph, input);

  if (sources.length === 0) {
    return { sources: [], impacts: [] };
  }

  const seen = new Set<string>();
  const impacts: ImpactItem[] = [];
  const queue: { nodeId: string; depth: number; reason: string; action: DependencyAction; edgeCategory: EdgeCategory }[] = [];

  for (const src of sources) {
    seen.add(src.id);
    for (const edge of adjacency.get(src.id) ?? []) {
      queue.push({
        nodeId: edge.to,
        depth: 1,
        reason: edge.reason,
        action: edge.action,
        edgeCategory: edge.category,
      });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.nodeId)) continue;
    seen.add(current.nodeId);

    const node = nodeIndex.get(current.nodeId);
    impacts.push({
      nodeId: current.nodeId,
      label: node?.label ?? current.nodeId,
      category: node?.category ?? "file",
      path: node?.path ?? (node?.category === "file" ? node?.id : undefined),
      action: current.action,
      reason: current.reason,
      edgeCategory: current.edgeCategory,
      depth: current.depth,
    });

    const isSource = sources.some((s) => s.id === current.nodeId);
    if (node && node.expand === false && !isSource) {
      continue;
    }

    for (const edge of adjacency.get(current.nodeId) ?? []) {
      if (seen.has(edge.to)) continue;
      queue.push({
        nodeId: edge.to,
        depth: current.depth + 1,
        reason: edge.reason,
        action: edge.action,
        edgeCategory: edge.category,
      });
    }
  }

  return { sources, impacts };
}

function resolveFilePath(nodeId: string, nodeIndex: Map<string, DependencyNode>): string | undefined {
  const node = nodeIndex.get(nodeId);
  if (!node) {
    if (nodeId.startsWith("cursor/") || nodeId.startsWith("docs/")) {
      return normalizePath(nodeId);
    }
    return undefined;
  }
  if (node.path) return normalizePath(node.path);
  if (node.category === "file") return normalizePath(node.id);
  return undefined;
}

/** エッジごとにソース mtime > ターゲット mtime を検出 */
export function findStaleDependencies(graph: DependencyGraph): StaleItem[] {
  const nodeIndex = buildNodeIndex(graph);
  const stale: StaleItem[] = [];

  for (const edge of graph.edges) {
    const sourcePath = resolveFilePath(edge.from, nodeIndex);
    const targetPath = resolveFilePath(edge.to, nodeIndex);
    if (!sourcePath || !targetPath) continue;

    const sourceAbs = join(ROOT_DIR, sourcePath);
    const targetAbs = join(ROOT_DIR, targetPath);
    if (!existsSync(sourceAbs) || !existsSync(targetAbs)) continue;

    const sourceMtime = statSync(sourceAbs).mtime;
    const targetMtime = statSync(targetAbs).mtime;
    if (sourceMtime > targetMtime) {
      stale.push({
        source: sourcePath,
        target: targetPath,
        reason: edge.reason,
        sourceMtime,
        targetMtime,
      });
    }
  }

  return stale;
}

export function formatImpactMarkdown(
  input: string,
  sources: DependencyNode[],
  impacts: ImpactItem[]
): string {
  const lines: string[] = [
    `# 影響チェックリスト: ${input}`,
    "",
  ];

  if (sources.length === 0) {
    lines.push("_依存グラフに一致するノードがありません。_");
    return lines.join("\n");
  }

  lines.push("## 変更元", "");
  for (const s of sources) {
    lines.push(`- **${s.label}** (\`${s.id}\`)`);
  }
  lines.push("");

  if (impacts.length === 0) {
    lines.push("_下流の依存は定義されていません。_");
    return lines.join("\n");
  }

  lines.push("## 確認・更新が必要な項目", "");
  lines.push("| 優先 | 項目 | アクション | カテゴリ | 理由 |");
  lines.push("|------|------|-----------|---------|------|");

  for (const item of impacts) {
    const actionLabel =
      item.action === "sync"
        ? "sync"
        : item.action === "regenerate"
          ? "再生成"
          : item.action === "update"
            ? "更新"
            : "確認";
    lines.push(
      `| ${item.depth} | ${item.label} | ${actionLabel} | ${item.edgeCategory} | ${item.reason} |`
    );
  }

  lines.push("");
  lines.push("## 推奨コマンド", "");
  lines.push("```bash");
  lines.push("npm run validate");
  if (impacts.some((i) => i.action === "sync" || i.path?.startsWith("docs/exports/"))) {
    lines.push("npm run steward -- sync all");
  }
  if (impacts.some((i) => i.nodeId.includes("dashboard") || i.path?.includes("reports/dashboard"))) {
    lines.push("npm run steward -- dashboard");
  }
  lines.push("```");

  return lines.join("\n");
}

export function formatGraphSummaryMarkdown(graph: DependencyGraph): string {
  const nodeIndex = buildNodeIndex(graph);
  const byCategory = new Map<EdgeCategory, DependencyEdge[]>();

  for (const edge of graph.edges) {
    const list = byCategory.get(edge.category) ?? [];
    list.push(edge);
    byCategory.set(edge.category, list);
  }

  const lines: string[] = [
    "# Steward パラメータ依存関係マップ",
    "",
    graph.description ?? "",
    "",
    `ノード: ${graph.nodes.length} / エッジ: ${graph.edges.length}`,
    "",
  ];

  for (const [category, edges] of [...byCategory.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "ja")
  )) {
    lines.push(`## ${category}`, "");
    for (const edge of edges) {
      const fromLabel = nodeIndex.get(edge.from)?.label ?? edge.from;
      const toLabel = nodeIndex.get(edge.to)?.label ?? edge.to;
      lines.push(`- **${fromLabel}** → **${toLabel}**: ${edge.reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
