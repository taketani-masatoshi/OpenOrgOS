import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  orgChartFileSchema,
  type OrgChartFile,
  type OrgChartNode,
} from "../../../schemas/org/org-chart.js";
import {
  layoutDiagram,
  type DiagramLayoutResult,
  type DiagramLogicalEdge,
  type DiagramLogicalNode,
} from "../canvas-views/diagram-layout.js";
import { getDataDir } from "../utils.js";

const BOARD_ROOT_ID = "__board__";

/** Primary label for org-chart boxes — organization / role unit name, never a person. */
export function orgUnitLabel(n: OrgChartNode): string {
  return n.display_name.trim() || n.title.trim() || n.id;
}

function orgUnitSublabel(n: OrgChartNode): string | undefined {
  const title = n.title.trim();
  const fn = n.function && n.function !== "—" ? n.function.trim() : "";
  const primary = orgUnitLabel(n);
  const parts: string[] = [];
  if (title && title !== primary) parts.push(title);
  if (fn && fn !== primary && fn !== title) parts.push(fn);
  return parts.length ? parts.join(" · ") : undefined;
}

/**
 * Build positioned org-chart diagram.
 * Top is 取締役会 (existing root or synthetic) — never the company name.
 * Node labels are organization unit names.
 */
export function layoutOrgChartDiagram(
  chart: OrgChartFile,
  _companyLabel?: string
): DiagramLayoutResult {
  const hasChild = new Set(
    chart.nodes.map((n) => n.reports_to).filter((id): id is string => !!id)
  );

  const rootNodes = chart.nodes.filter((n) => n.reports_to == null || n.reports_to === "");
  const hasBoardRoot = rootNodes.some(
    (n) =>
      n.layer === "board" &&
      (n.id === "board" || /取締役会|取締役/.test(n.display_name + n.title))
  );

  const nodes: DiagramLogicalNode[] = [];
  const edges: DiagramLogicalEdge[] = [];

  if (!hasBoardRoot && rootNodes.length > 0) {
    nodes.push({
      id: BOARD_ROOT_ID,
      label: "取締役会",
      kind: "root",
      tone: "info",
    });
  }

  for (const n of chart.nodes) {
    const isUnitBranch =
      n.layer === "staff" &&
      !n.employee_id &&
      (hasChild.has(n.id) || /本部|部|室|課|会/.test(n.title + n.display_name));
    const isBoardRoot =
      (n.reports_to == null || n.reports_to === "") &&
      n.layer === "board" &&
      (n.id === "board" || /取締役会/.test(n.display_name + n.title));
    nodes.push({
      id: n.id,
      label: orgUnitLabel(n),
      kind: isBoardRoot
        ? "root"
        : n.board_role === "representative_director"
          ? "branch"
          : n.layer === "board"
            ? "detached"
            : isUnitBranch || hasChild.has(n.id)
              ? "branch"
              : "leaf",
      tone: n.layer === "board" || isUnitBranch ? "info" : "neutral",
    });
  }

  for (const n of chart.nodes) {
    if (n.reports_to == null || n.reports_to === "") {
      if (hasBoardRoot) continue;
      const boardPeer =
        n.layer === "board" && n.board_role !== "representative_director";
      edges.push({
        from: BOARD_ROOT_ID,
        to: n.id,
        style: boardPeer ? "dashed" : "solid",
      });
    } else {
      edges.push({ from: n.reports_to, to: n.id, style: "solid" });
    }
  }

  return layoutDiagram({
    nodes,
    edges,
    nodeWidth: 88,
    nodeHeight: 28,
    rankGap: 28,
    nodeGap: 12,
    padding: 8,
  });
}

export function orgChartYamlPath(): string {
  return join(getDataDir(), "org", "org-chart.yaml");
}

export function loadOrgChart(): OrgChartFile | null {
  const path = orgChartYamlPath();
  if (!existsSync(path)) return null;
  return orgChartFileSchema.parse(parseYaml(readFileSync(path, "utf-8")));
}

export function boardNodes(chart: OrgChartFile): OrgChartNode[] {
  return chart.nodes.filter((n) => n.layer === "board");
}

/** Roots of the org tree (取締役会 · 報告先なしの組織単位). */
export function reportingRoots(chart: OrgChartFile): OrgChartNode[] {
  return chart.nodes.filter((n) => n.reports_to == null || n.reports_to === "");
}

export function childrenOf(chart: OrgChartFile, parentId: string): OrgChartNode[] {
  return chart.nodes.filter((n) => n.reports_to === parentId);
}

/** @deprecated Prefer orgUnitLabel — kept for call sites expecting person+title format. */
export function nodeLabel(n: OrgChartNode): string {
  const sub = orgUnitSublabel(n);
  return sub ? `${orgUnitLabel(n)}（${sub}）` : orgUnitLabel(n);
}

/** Indented tree lines for text section (organization units only). */
export function formatReportingTree(chart: OrgChartFile): string[] {
  const byId = new Map(chart.nodes.map((n) => [n.id, n]));
  const lines: string[] = [];

  const walk = (node: OrgChartNode, depth: number) => {
    const prefix = depth === 0 ? "" : `${"　".repeat(depth - 1)}└ `;
    const sub = orgUnitSublabel(node);
    lines.push(`${prefix}${orgUnitLabel(node)}${sub ? ` — ${sub}` : ""}`);
    for (const child of childrenOf(chart, node.id)) {
      walk(child, depth + 1);
    }
  };

  for (const root of reportingRoots(chart)) {
    walk(root, 0);
  }

  for (const n of chart.nodes) {
    if (n.reports_to && !byId.has(n.reports_to)) {
      lines.push(`⚠ 上位組織不明: ${orgUnitLabel(n)} → ${n.reports_to}`);
    }
  }

  return lines.length ? lines : ["（組織ノードなし）"];
}
