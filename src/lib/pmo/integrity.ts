import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { usesForeignIdPrefix } from "../../../schemas/projects/index.js";
import { listCatalogModuleIds } from "../modules.js";
import type { IntegrityIssue } from "../integrity.js";
import { getDataDir } from "../utils.js";
import { loadPmoPortfolio, PMO_DIR_REL, PMO_PORTFOLIO_REL, pmoDirExists } from "./load.js";

export interface PmoIntegrityContext {
  propertyIds: Set<string>;
  contractIds: Set<string>;
}

function pushIssue(
  issues: IntegrityIssue[],
  level: IntegrityIssue["level"],
  file: string,
  message: string
): void {
  issues.push({ level, file, message });
}

function loadIdSet(relPath: string, arrayKey: string): Set<string> | null {
  const abs = join(getDataDir(), ...relPath.replace(/^data\//, "").split("/"));
  if (!existsSync(abs)) return null;
  try {
    const raw = YAML.parse(readFileSync(abs, "utf-8")) as Record<string, unknown>;
    const arr = raw[arrayKey];
    if (!Array.isArray(arr)) return new Set();
    return new Set(
      arr
        .map((row) => (row && typeof row === "object" && "id" in row ? String((row as { id: unknown }).id) : ""))
        .filter(Boolean)
    );
  } catch {
    return null;
  }
}

export function collectPmoIntegrityIssues(ctx: PmoIntegrityContext): IntegrityIssue[] {
  if (!pmoDirExists()) return [];

  const issues: IntegrityIssue[] = [];
  let loaded;
  try {
    loaded = loadPmoPortfolio();
  } catch (e) {
    pushIssue(
      issues,
      "error",
      PMO_DIR_REL,
      e instanceof Error ? e.message : String(e)
    );
    return issues;
  }

  if (!loaded.portfolio) {
    pushIssue(issues, "error", PMO_PORTFOLIO_REL, "portfolio.yaml is missing");
    return issues;
  }

  const indexIds = loaded.portfolio.projects.map((p) => p.id);
  const fileIds = loaded.projects.map((p) => p.id);
  const indexSet = new Set(indexIds);
  const fileSet = new Set(fileIds);

  const seenIndex = new Set<string>();
  for (const id of indexIds) {
    if (seenIndex.has(id)) {
      pushIssue(issues, "error", PMO_PORTFOLIO_REL, `duplicate project id ${id}`);
    }
    seenIndex.add(id);
  }

  const seenFiles = new Set<string>();
  for (const project of loaded.projects) {
    const rel = `${PMO_DIR_REL}/${project.id}.yaml`;
    if (seenFiles.has(project.id)) {
      pushIssue(issues, "error", rel, `duplicate project id ${project.id}`);
    }
    seenFiles.add(project.id);
    if (usesForeignIdPrefix(project.id)) {
      pushIssue(issues, "error", rel, `${project.id} collides with a reserved id prefix`);
    }
    if (!indexSet.has(project.id)) {
      pushIssue(issues, "error", rel, `${project.id} is not listed in portfolio.yaml`);
    }
  }

  for (const entry of loaded.portfolio.projects) {
    if (!fileSet.has(entry.id)) {
      pushIssue(
        issues,
        "error",
        PMO_PORTFOLIO_REL,
        `${entry.id} is indexed but ${entry.id}.yaml is missing`
      );
    }
  }

  const indexById = new Map(loaded.portfolio.projects.map((e) => [e.id, e]));
  const catalogModules = new Set(listCatalogModuleIds());
  const permitIds = loadIdSet("data/permit-applications/application-registry.yaml", "applications");
  const caseIds = loadIdSet("data/corporate-registration/case-registry.yaml", "cases");

  for (const project of loaded.projects) {
    const rel = `${PMO_DIR_REL}/${project.id}.yaml`;
    const indexed = indexById.get(project.id);
    if (indexed) {
      if (indexed.status !== project.status || indexed.rag !== project.rag || indexed.owner_agent !== project.owner_agent) {
        pushIssue(
          issues,
          "warning",
          rel,
          `index in portfolio.yaml differs from file (status/rag/owner_agent)`
        );
      }
    }

    for (const ctr of project.links.contract_ids) {
      if (!ctx.contractIds.has(ctr)) {
        pushIssue(issues, "warning", rel, `unknown contract_id ${ctr}`);
      }
    }
    for (const prop of project.links.property_ids) {
      if (!ctx.propertyIds.has(prop)) {
        pushIssue(issues, "warning", rel, `unknown property_id ${prop}`);
      }
    }
    for (const wo of project.links.work_order_ids) {
      if (usesForeignIdPrefix(wo) && !wo.startsWith("IMP-") && !wo.startsWith("WO-")) {
        pushIssue(issues, "error", rel, `work_order_id ${wo} is not IMP-/WO-`);
      }
    }
    for (const ref of project.links.module_refs) {
      if (!catalogModules.has(ref.module)) {
        pushIssue(issues, "warning", rel, `unknown module ${ref.module}`);
      }
      if (ref.ref?.startsWith("APP-") && permitIds && !permitIds.has(ref.ref)) {
        pushIssue(issues, "warning", rel, `unknown permit application ${ref.ref}`);
      }
      if (ref.ref?.startsWith("CHG-") && caseIds && !caseIds.has(ref.ref)) {
        pushIssue(issues, "warning", rel, `unknown registration case ${ref.ref}`);
      }
    }
  }

  return issues;
}
