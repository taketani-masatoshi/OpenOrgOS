/**
 * Company organization + console-user readiness for Operator Console.
 * Names come from employees / company officers. Never emit address, email, or L2.
 */
import type { OperatorRecord, OperatorRole } from "../../../schemas/org/operator.js";
import type { OrgChartFile, OrgChartNode } from "../../../schemas/org/org-chart.js";
import { extractCompanyOfficers } from "../company-officers-view.js";
import { loadCompany, loadEmployees } from "../data.js";
import {
  buildCompanyAdvisors,
  type CompanyOrgAdvisorRow,
} from "./company-advisors.js";
import { listActiveOperators } from "../org/operators.js";
import { loadOrgAuthority } from "../org/org-authority.js";
import { resolveEffectiveOperatorAccess } from "../org/operator-effective.js";
import {
  credentialPurpose,
  listWebAuthnCredentials,
} from "../wire-console/auth/webauthn-store.js";

export type OrgUnitKind = "board" | "department";
export type OrgUnitOooRight = "approve" | "wire" | "transfer" | "chat" | "all_agents";

export interface CompanyOrgMember {
  name: string;
  title: string;
  note?: string;
  operator_id?: string;
  role?: OperatorRole;
  login_id_ready: boolean;
  community_login_ready: boolean;
  login_passkey_ready: boolean;
  settlement_passkey_ready: boolean;
  rights: OrgUnitOooRight[];
}

export interface CompanyOrgUnitRow {
  unit_id: string;
  unit_label: string;
  kind: OrgUnitKind;
  function: string;
  reports_to_label: string;
  depth: number;
  vacant: boolean;
  collegial: boolean;
  members: CompanyOrgMember[];
}

export interface CompanyOrgUserRow extends CompanyOrgMember {
  unit_label?: string;
}

export type { CompanyOrgAdvisorRow } from "./company-advisors.js";

export interface CompanyOrgView {
  units: CompanyOrgUnitRow[];
  users: CompanyOrgUserRow[];
  advisors: CompanyOrgAdvisorRow[];
}

const AGENTISH_NAME = /オペレータ|オペレーター|エージェント|secretary|agent|steward|mcp/i;

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function isHumanOperator(op: OperatorRecord): boolean {
  return !AGENTISH_NAME.test(op.display_name) && !AGENTISH_NAME.test(op.approver_name ?? "");
}

function labelOf(nodes: OrgChartNode[], id: string | null | undefined): string {
  if (!id) return "—";
  return nodes.find((n) => n.id === id)?.display_name ?? id;
}

function treeOrder(chart: OrgChartFile): OrgChartNode[] {
  const children = new Map<string, OrgChartNode[]>();
  for (const n of chart.nodes) children.set(n.id, []);
  const roots: OrgChartNode[] = [];
  for (const n of chart.nodes) {
    if (n.reports_to) children.get(n.reports_to)?.push(n);
    else roots.push(n);
  }
  const out: OrgChartNode[] = [];
  const walk = (n: OrgChartNode) => {
    out.push(n);
    for (const c of children.get(n.id) ?? []) walk(c);
  };
  for (const r of roots) walk(r);
  for (const n of chart.nodes) {
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

function unitDepth(node: OrgChartNode, nodes: OrgChartNode[]): number {
  let depth = 0;
  let cursor = node.reports_to;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    depth += 1;
    cursor = nodes.find((n) => n.id === cursor)?.reports_to;
  }
  return depth;
}

function loadEmployeeMap(): Map<string, { name: string; job_type: string }> {
  try {
    return new Map(
      loadEmployees().employees.map((e) => [
        e.id,
        { name: e.name, job_type: e.job_type?.trim() || "" },
      ])
    );
  } catch {
    return new Map();
  }
}

function rightsFromOperator(op: OperatorRecord): OrgUnitOooRight[] {
  const eff = resolveEffectiveOperatorAccess(op);
  const rights: OrgUnitOooRight[] = [];
  if (
    eff.permissions.includes("chat:approve") ||
    eff.permissions.includes("protocol:approve") ||
    eff.permissions.includes("scheduling:approve")
  ) {
    rights.push("approve");
  }
  if (eff.permissions.includes("chat:wire")) rights.push("wire");
  if (eff.permissions.includes("broker:transfer")) rights.push("transfer");
  if (eff.permissions.includes("chat:ask") || eff.permissions.includes("chat:read")) {
    rights.push("chat");
  }
  if (eff.allowed_agents === null) rights.push("all_agents");
  return rights;
}

function loadPasskeyIndex(): Map<string, { login: boolean; settlement: boolean }> {
  const index = new Map<string, { login: boolean; settlement: boolean }>();
  try {
    for (const cred of listWebAuthnCredentials()) {
      const key = normalizeName(cred.operator_id);
      if (!key) continue;
      const current = index.get(key) ?? { login: false, settlement: false };
      if (credentialPurpose(cred) === "settlement") current.settlement = true;
      else current.login = true;
      index.set(key, current);
    }
  } catch {
    /* store missing/unreadable — readiness stays false */
  }
  return index;
}

function operatorForPerson(
  name: string,
  unitId: string,
  operators: OperatorRecord[]
): OperatorRecord | undefined {
  const needle = normalizeName(name);
  if (!needle) return undefined;
  const humans = operators.filter(isHumanOperator);
  const exact = humans.find((op) =>
    [op.display_name, op.approver_name]
      .filter((v): v is string => Boolean(v?.trim()))
      .some((v) => normalizeName(v) === needle)
  );
  if (exact) return exact;
  return humans.find((op) => op.org_unit_id === unitId);
}

function resignationNoteFor(name: string): string | undefined {
  try {
    const res = loadCompany().governance_status?.director_resignation;
    if (!res?.person?.trim()) return undefined;
    if (normalizeName(res.person) !== normalizeName(name)) return undefined;
    const bits = [
      "辞任手続中",
      res.status === "pending_registration" ? "登記完了まで取締役欄は現状維持" : undefined,
    ].filter(Boolean);
    return bits.join("。");
  } catch {
    return undefined;
  }
}

function authorityHeadId(unitId: string): string | undefined {
  const file = loadOrgAuthority();
  return file?.units.find((u) => u.org_unit_id === unitId)?.head_operator_id;
}

function memberFromPerson(input: {
  name: string;
  title: string;
  unitId: string;
  operators: OperatorRecord[];
  passkeys: Map<string, { login: boolean; settlement: boolean }>;
  note?: string;
}): CompanyOrgMember {
  const op =
    operatorForPerson(input.name, input.unitId, input.operators) ??
    (authorityHeadId(input.unitId)
      ? input.operators.find((o) => o.operator_id === authorityHeadId(input.unitId))
      : undefined);
  const human = op && isHumanOperator(op) ? op : undefined;
  const keys = human ? input.passkeys.get(normalizeName(human.operator_id)) : undefined;
  const listedIds = Boolean(human?.webauthn_credential_ids?.length);
  return {
    name: input.name,
    title: input.title,
    note: input.note ?? resignationNoteFor(input.name),
    operator_id: human?.operator_id,
    role: human?.role,
    login_id_ready: Boolean(human?.operator_id),
    community_login_ready: Boolean(human?.email?.trim()),
    login_passkey_ready: Boolean(keys?.login || listedIds),
    settlement_passkey_ready: Boolean(keys?.settlement),
    rights: human ? rightsFromOperator(human) : [],
  };
}

function unitShell(
  node: OrgChartNode,
  nodes: OrgChartNode[],
  extras: Pick<CompanyOrgUnitRow, "vacant" | "collegial" | "members">
): CompanyOrgUnitRow {
  return {
    unit_id: node.id,
    unit_label: node.display_name,
    kind: node.layer === "board" ? "board" : "department",
    function: node.function,
    reports_to_label: labelOf(nodes, node.reports_to),
    depth: unitDepth(node, nodes),
    ...extras,
  };
}

function collectUsers(
  units: CompanyOrgUnitRow[],
  operators: OperatorRecord[],
  passkeys: Map<string, { login: boolean; settlement: boolean }>
): CompanyOrgUserRow[] {
  const users: CompanyOrgUserRow[] = [];
  const seen = new Set<string>();
  for (const unit of units) {
    for (const member of unit.members) {
      const key = normalizeName(member.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      users.push({ ...member, unit_label: unit.unit_label });
    }
  }
  for (const op of operators.filter(isHumanOperator)) {
    const name = op.approver_name?.trim() || op.display_name;
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    users.push({
      ...memberFromPerson({
        name,
        title: "",
        unitId: op.org_unit_id ?? "",
        operators,
        passkeys,
      }),
    });
  }
  return users;
}

/**
 * Units (tree order) plus unique console users and their login / PassKey readiness.
 */
export function buildCompanyOrgView(chart: OrgChartFile): CompanyOrgView {
  const employees = loadEmployeeMap();
  const company = loadCompany();
  const officers = extractCompanyOfficers(company);
  const operators = listActiveOperators();
  const passkeys = loadPasskeyIndex();
  const units: CompanyOrgUnitRow[] = [];

  for (const node of treeOrder(chart)) {
    if (node.board_role === "representative_director" && !node.employee_id && officers.length > 0) {
      units.push(
        unitShell(node, chart.nodes, {
          vacant: false,
          collegial: false,
          members: officers.map((officer) =>
            memberFromPerson({
              name: officer.name,
              title: officer.role || node.title,
              unitId: node.id,
              operators,
              passkeys,
            })
          ),
        })
      );
      continue;
    }

    if (node.layer === "board" && node.board_role === "none" && !node.employee_id) {
      units.push(
        unitShell(node, chart.nodes, {
          vacant: false,
          collegial: true,
          members: [],
        })
      );
      continue;
    }

    const employee = node.employee_id ? employees.get(node.employee_id) : undefined;
    if (employee) {
      units.push(
        unitShell(node, chart.nodes, {
          vacant: false,
          collegial: false,
          members: [
            memberFromPerson({
              name: employee.name,
              title: employee.job_type || node.title,
              unitId: node.id,
              operators,
              passkeys,
            }),
          ],
        })
      );
      continue;
    }

    const authorityOp = authorityHeadId(node.id)
      ? operators.find((o) => o.operator_id === authorityHeadId(node.id) && isHumanOperator(o))
      : undefined;
    if (authorityOp) {
      units.push(
        unitShell(node, chart.nodes, {
          vacant: false,
          collegial: false,
          members: [
            memberFromPerson({
              name: authorityOp.approver_name?.trim() || authorityOp.display_name,
              title: node.title,
              unitId: node.id,
              operators,
              passkeys,
            }),
          ],
        })
      );
      continue;
    }

    units.push(
      unitShell(node, chart.nodes, {
        vacant: true,
        collegial: false,
        members: [],
      })
    );
  }

  return {
    units,
    users: collectUsers(units, operators, passkeys),
    advisors: buildCompanyAdvisors(company),
  };
}

/** @deprecated Prefer buildCompanyOrgView — kept for callers that only need units. */
export function buildCompanyOrgTable(chart: OrgChartFile): CompanyOrgUnitRow[] {
  return buildCompanyOrgView(chart).units;
}
