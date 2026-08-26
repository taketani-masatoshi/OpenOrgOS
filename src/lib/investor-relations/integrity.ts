import type { IntegrityIssue } from "../integrity.js";
import { isModuleEnabled } from "../module-business-data.js";
import { reviewCapTable } from "./cap-table.js";
import { collectCapitalRaiseIrCrossCheckIssues } from "./capital-raise-crosscheck.js";
import {
  IR_CAP_TABLE_FILE,
  IR_DISCLOSURE_CALENDAR_FILE,
  IR_INVESTOR_REGISTRY_FILE,
  IR_MATERIALS_FILE,
  IR_DIR_REL,
  IR_MODULE_ID,
} from "./constants.js";
import {
  irDataDirExists,
  loadIrCapTable,
  loadIrDisclosureCalendar,
  loadIrInvestorRegistry,
  loadIrMaterials,
} from "./load.js";

function pushIssue(
  issues: IntegrityIssue[],
  level: IntegrityIssue["level"],
  file: string,
  message: string,
): void {
  issues.push({ level, file, message });
}

export function collectIrIntegrityIssues(): IntegrityIssue[] {
  const moduleEnabled = isModuleEnabled(IR_MODULE_ID);
  if (!moduleEnabled && !irDataDirExists()) return [];

  const issues: IntegrityIssue[] = [];
  if (moduleEnabled && !irDataDirExists()) {
    pushIssue(
      issues,
      "error",
      IR_DIR_REL,
      "investor_relations enabled but tenant data/investor-relations/ has no YAML — copy from steward/modules/investor_relations/seed/",
    );
    return issues;
  }

  if (!irDataDirExists()) return issues;

  const capLoaded = loadIrCapTable();
  if (!capLoaded) {
    pushIssue(
      issues,
      moduleEnabled ? "error" : "warning",
      `${IR_DIR_REL}/${IR_CAP_TABLE_FILE}`,
      `${IR_CAP_TABLE_FILE} missing under tenant data root`,
    );
  } else {
    const review = reviewCapTable(capLoaded.data);
    for (const issue of review.issues.filter((entry) => entry.level === "error")) {
      pushIssue(issues, "error", `${IR_DIR_REL}/${IR_CAP_TABLE_FILE}`, issue.message);
    }
    for (const cross of collectCapitalRaiseIrCrossCheckIssues(capLoaded.data)) {
      pushIssue(
        issues,
        cross.level,
        "data/finance/capital-raise-cases.yaml",
        cross.message,
      );
    }
  }

  const registryLoaded = loadIrInvestorRegistry();
  if (!registryLoaded) {
    pushIssue(
      issues,
      moduleEnabled ? "error" : "warning",
      `${IR_DIR_REL}/${IR_INVESTOR_REGISTRY_FILE}`,
      `${IR_INVESTOR_REGISTRY_FILE} missing under tenant data root`,
    );
  } else {
    const ids = new Set<string>();
    for (const contact of registryLoaded.data.contacts) {
      if (ids.has(contact.id)) {
        pushIssue(
          issues,
          "error",
          `${IR_DIR_REL}/${IR_INVESTOR_REGISTRY_FILE}`,
          `duplicate contact id ${contact.id}`,
        );
      }
      ids.add(contact.id);
    }
  }

  const calendarLoaded = loadIrDisclosureCalendar();
  if (!calendarLoaded) {
    pushIssue(
      issues,
      moduleEnabled ? "error" : "warning",
      `${IR_DIR_REL}/${IR_DISCLOSURE_CALENDAR_FILE}`,
      `${IR_DISCLOSURE_CALENDAR_FILE} missing under tenant data root`,
    );
  } else {
    const ids = new Set<string>();
    for (const item of calendarLoaded.data.items) {
      if (ids.has(item.id)) {
        pushIssue(
          issues,
          "error",
          `${IR_DIR_REL}/${IR_DISCLOSURE_CALENDAR_FILE}`,
          `duplicate disclosure id ${item.id}`,
        );
      }
      ids.add(item.id);
    }
  }

  if (!loadIrMaterials()) {
    pushIssue(
      issues,
      moduleEnabled ? "error" : "warning",
      `${IR_DIR_REL}/${IR_MATERIALS_FILE}`,
      `${IR_MATERIALS_FILE} missing under tenant data root`,
    );
  }

  return issues;
}
