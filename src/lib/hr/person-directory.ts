import { existsSync } from "node:fs";
import { join } from "node:path";
import { workforceFileSchema } from "../../../schemas/attention-midterm.js";
import { employeesFileSchema } from "../../../schemas/hr.js";
import { loadOrgChart } from "../org/org-chart.js";
import { getDataDir, readYamlFile } from "../utils.js";

export type BudgetPersonSource = "employees" | "workforce" | "org_chart";

export type BudgetPerson = {
  person_id: string;
  display_name: string;
  person_type: "employee" | "contractor" | "other";
  source: BudgetPersonSource;
  employee_id?: string;
  org_node_id?: string;
  org_unit_id?: string;
  contract_id?: string;
};

function loadEmployees() {
  const path = join(getDataDir(), "hr", "employees.yaml");
  if (!existsSync(path)) return [];
  try {
    return readYamlFile(path, employeesFileSchema).employees;
  } catch {
    return [];
  }
}

function loadWorkforce() {
  const path = join(getDataDir(), "hr", "workforce.yaml");
  if (!existsSync(path)) return [];
  try {
    return readYamlFile(path, workforceFileSchema).people.filter(
      (person) => !person.demo,
    );
  } catch {
    return [];
  }
}

function workforceType(
  employmentType: string | undefined,
): BudgetPerson["person_type"] {
  return employmentType === "contractor" ? "contractor" : "other";
}

/**
 * Authenticated budget person directory.
 * Full HR/workforce names win over the intentionally abbreviated org-chart label.
 */
export function loadBudgetPeople(): BudgetPerson[] {
  const chart = loadOrgChart();
  const employees = loadEmployees();
  const workforce = loadWorkforce();
  const employeeById = new Map(employees.map((person) => [person.id, person]));
  const workforceByNode = new Map(
    workforce
      .filter((person) => person.org_node_id)
      .map((person) => [person.org_node_id!, person]),
  );
  const people = new Map<string, BudgetPerson>();

  for (const node of chart?.nodes ?? []) {
    const employee = node.employee_id
      ? employeeById.get(node.employee_id)
      : undefined;
    const workforcePerson = workforceByNode.get(node.id);
    const isExternal = node.id.startsWith("ORG-EXT-");
    if (!employee && !workforcePerson && !isExternal) continue;
    if (employee?.status && employee.status !== "active") continue;

    people.set(node.id, {
      person_id: node.id,
      display_name:
        employee?.name ?? workforcePerson?.name ?? node.display_name,
      person_type: employee
        ? employee.employment_type === "contractor"
          ? "contractor"
          : "employee"
        : isExternal
          ? "contractor"
          : workforceType(workforcePerson?.employment_type),
      source: employee
        ? "employees"
        : workforcePerson?.name
          ? "workforce"
          : "org_chart",
      employee_id: employee?.id ?? workforcePerson?.employee_id,
      org_node_id: node.id,
      org_unit_id: workforcePerson?.org_unit_id,
      contract_id: employee?.contract_id ?? workforcePerson?.contract_id,
    });
  }

  for (const person of workforce) {
    if (!person.name || !person.org_unit_id) continue;
    const personId = person.org_node_id ?? person.id;
    if (people.has(personId)) continue;
    people.set(personId, {
      person_id: personId,
      display_name: person.name,
      person_type: workforceType(person.employment_type),
      source: "workforce",
      employee_id: person.employee_id,
      org_node_id: person.org_node_id,
      org_unit_id: person.org_unit_id,
      contract_id: person.contract_id,
    });
  }

  return [...people.values()].sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "ja"),
  );
}

export function findBudgetPerson(personId: string): BudgetPerson | undefined {
  return loadBudgetPeople().find((person) => person.person_id === personId);
}

export function budgetPersonBelongsToDepartment(
  person: BudgetPerson,
  orgUnitId: string,
): boolean {
  if (person.org_unit_id) return person.org_unit_id === orgUnitId;
  if (!person.org_node_id) return false;
  const chart = loadOrgChart();
  if (!chart) return false;
  const nodes = new Map(chart.nodes.map((node) => [node.id, node]));
  let current = nodes.get(person.org_node_id);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.id === orgUnitId || current.reports_to === orgUnitId) {
      return true;
    }
    visited.add(current.id);
    current = current.reports_to ? nodes.get(current.reports_to) : undefined;
  }
  return false;
}
