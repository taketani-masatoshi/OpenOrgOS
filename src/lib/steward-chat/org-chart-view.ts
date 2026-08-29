/**
 * L1 org-chart payload for Operator Console / Steward Chat.
 * Company chart (board-approved) is separate from the running agent roster.
 */
import { getCatalogAgent } from "../agent-catalog.js";
import { buildAgentRosterTodaySummary } from "../agent-roster.js";
import { loadCompany } from "../data.js";
import {
  formatReportingTree,
  layoutOrgChartDiagram,
} from "../org/org-chart.js";
import { listOrgChartHistory, loadOrgChartAsOf } from "../org/org-chart-history.js";
import type { DiagramLayoutResult } from "../canvas-views/diagram-layout.js";
import type { OrgChartNode } from "../../../schemas/org/org-chart.js";
import type { OrgChartHistoryEntry } from "../../../schemas/org/org-chart-history.js";
import { buildCompanyAdvisors, type CompanyOrgAdvisorRow } from "./company-advisors.js";
import {
  buildCompanyOrgView,
  type CompanyOrgUnitRow,
  type CompanyOrgUserRow,
} from "./company-org-table.js";

const ORG_CHART_PATH = "data/org/org-chart.yaml";

export type OrgChartAgentRow = {
  id: string;
  label: string;
  tier: string;
  scope?: string;
  reports_to?: string;
};

export type OrgChartAgentsPayload = {
  configured: boolean;
  operational: OrgChartAgentRow[];
  developer: OrgChartAgentRow[];
  task: OrgChartAgentRow[];
};

export type OrgChartHistoryRow = OrgChartHistoryEntry & { current?: boolean };

type OrgChartShared = {
  ok: true;
  company_name: string;
  path: string;
  agents: OrgChartAgentsPayload;
  history: OrgChartHistoryRow[];
  viewing_as_of?: string;
  is_historical: boolean;
  advisors: CompanyOrgAdvisorRow[];
};

export type OrgChartApiPayload =
  | (OrgChartShared & {
      missing: true;
      message: string;
    })
  | (OrgChartShared & {
      missing: false;
      as_of: string;
      notes?: string;
      nodes: OrgChartNode[];
      units: CompanyOrgUnitRow[];
      users: CompanyOrgUserRow[];
      tree_lines: string[];
      diagram: DiagramLayoutResult;
    });

function mapAgentRow(row: { id: string; label: string; tier: string }): OrgChartAgentRow {
  const agent = getCatalogAgent(row.id);
  return {
    id: row.id,
    label: row.label,
    tier: row.tier,
    scope: agent?.scope?.trim() || undefined,
    reports_to: agent?.reports_to,
  };
}

export function buildOrgChartAgentsPayload(): OrgChartAgentsPayload {
  const roster = buildAgentRosterTodaySummary();
  return {
    configured: roster.configured,
    operational: roster.operational.map(mapAgentRow),
    developer: roster.developer.map(mapAgentRow),
    task: roster.task.map(mapAgentRow),
  };
}

export function buildOrgChartApiPayload(opts?: { asOf?: string }): OrgChartApiPayload {
  const company = loadCompany();
  const agents = buildOrgChartAgentsPayload();
  const history = listOrgChartHistory();
  const loaded = loadOrgChartAsOf(opts?.asOf);
  const shared: OrgChartShared = {
    ok: true,
    company_name: loaded.chart?.company_label?.trim() || company.name,
    path: ORG_CHART_PATH,
    agents,
    history,
    viewing_as_of: loaded.viewing_as_of,
    is_historical: loaded.is_historical,
    advisors: buildCompanyAdvisors(company),
  };

  if (!loaded.chart) {
    return {
      ...shared,
      missing: true,
      message:
        "組織図ファイルがありません。取締役会の決定を経た Path: data/org/org-chart.yaml を追加してください。",
    };
  }

  const companyName = loaded.chart.company_label?.trim() || company.name;
  const org = buildCompanyOrgView(loaded.chart);
  return {
    ...shared,
    missing: false,
    company_name: companyName,
    as_of: loaded.chart.as_of,
    notes: loaded.chart.notes,
    path: ORG_CHART_PATH,
    nodes: loaded.chart.nodes,
    units: org.units,
    users: org.users,
    tree_lines: formatReportingTree(loaded.chart),
    diagram: layoutOrgChartDiagram(loaded.chart, companyName),
  };
}
