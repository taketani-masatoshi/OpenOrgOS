import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  orgAuthorityFileSchema,
  type OrgAuthorityFile,
  type OrgAuthorityUnit,
} from "../../../schemas/org/org-authority.js";
import { loadOrgChart } from "./org-chart.js";
import { findOperatorById } from "./operators.js";
import { getDataDir } from "../utils.js";

export function orgAuthorityYamlPath(): string {
  return join(getDataDir(), "org", "org-authority.yaml");
}

export function loadOrgAuthority(): OrgAuthorityFile | null {
  const path = orgAuthorityYamlPath();
  if (!existsSync(path)) return null;
  return orgAuthorityFileSchema.parse(parseYaml(readFileSync(path, "utf-8")));
}

export type OrgAuthorityRow = {
  org_unit_id: string;
  unit_label: string;
  head_label: string;
  allowed_agents: string;
  permissions: string;
  budget_plan_man: number;
  budget_actual_man: number;
  burn_pct: number | null;
  notes: string;
};

function unitLabel(orgUnitId: string): string {
  const chart = loadOrgChart();
  const n = chart?.nodes.find((x) => x.id === orgUnitId);
  return n ? `${n.display_name}` : orgUnitId;
}

export function buildOrgAuthorityRows(
  file?: OrgAuthorityFile | null
): OrgAuthorityRow[] {
  const src = file ?? loadOrgAuthority();
  if (!src) return [];
  return src.units.map((u: OrgAuthorityUnit) => {
    const head = u.head_operator_id
      ? findOperatorById(u.head_operator_id)
      : undefined;
    const burn =
      u.budget_plan_man > 0
        ? Math.round((u.budget_actual_man / u.budget_plan_man) * 1000) / 10
        : null;
    return {
      org_unit_id: u.org_unit_id,
      unit_label: unitLabel(u.org_unit_id),
      head_label: head?.display_name ?? (u.head_operator_id ? u.head_operator_id : "—"),
      allowed_agents: u.allowed_agents.length
        ? u.allowed_agents.join(", ")
        : "—",
      permissions: u.permissions.length
        ? u.permissions.slice(0, 4).join(", ") +
          (u.permissions.length > 4 ? "…" : "")
        : "—",
      budget_plan_man: u.budget_plan_man,
      budget_actual_man: u.budget_actual_man,
      burn_pct: burn,
      notes: u.notes?.trim() || "—",
    };
  });
}

export function sumAuthorityBudgets(file: OrgAuthorityFile): {
  plan: number;
  actual: number;
  burn_pct: number | null;
} {
  const plan = file.units.reduce((s, u) => s + u.budget_plan_man, 0);
  const actual = file.units.reduce((s, u) => s + u.budget_actual_man, 0);
  return {
    plan,
    actual,
    burn_pct: plan > 0 ? Math.round((actual / plan) * 1000) / 10 : null,
  };
}
