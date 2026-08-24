/**
 * L1 org-chart payload for Operator Console / Steward Chat.
 */
import { loadCompany } from "../data.js";
import {
  formatReportingTree,
  layoutOrgChartDiagram,
  loadOrgChart,
} from "../org/org-chart.js";
import type { DiagramLayoutResult } from "../canvas-views/diagram-layout.js";
import type { OrgChartNode } from "../../../schemas/org/org-chart.js";

const ORG_CHART_PATH = "data/org/org-chart.yaml";

export type OrgChartApiPayload =
  | {
      ok: true;
      missing: true;
      company_name: string;
      path: string;
      message: string;
    }
  | {
      ok: true;
      missing: false;
      company_name: string;
      as_of: string;
      notes?: string;
      path: string;
      nodes: OrgChartNode[];
      tree_lines: string[];
      diagram: DiagramLayoutResult;
    };

export function buildOrgChartApiPayload(): OrgChartApiPayload {
  const company = loadCompany();
  const chart = loadOrgChart();
  if (!chart) {
    return {
      ok: true,
      missing: true,
      company_name: company.name,
      path: ORG_CHART_PATH,
      message:
        "組織図ファイルがありません。Path: data/org/org-chart.yaml を追加してください。",
    };
  }

  const companyName = chart.company_label?.trim() || company.name;
  return {
    ok: true,
    missing: false,
    company_name: companyName,
    as_of: chart.as_of,
    notes: chart.notes,
    path: ORG_CHART_PATH,
    nodes: chart.nodes,
    tree_lines: formatReportingTree(chart),
    diagram: layoutOrgChartDiagram(chart, companyName),
  };
}
