import { describe, expect, it } from "vitest";
import * as auditPlan from "../src/lib/iso-audit-plan.js";
import * as auditPrecheck from "../src/lib/iso-audit-precheck.js";
import * as catalog from "../src/lib/iso-catalog.js";
import * as clauseVerification from "../src/lib/iso-clause-verification.js";
import * as controlFramework from "../src/lib/control-framework.js";
import * as internalAudit from "../src/lib/iso-internal-audit.js";
import * as jsox from "../src/lib/jsox.js";
import * as kpi from "../src/lib/iso-kpi.js";
import * as records from "../src/lib/iso-records.js";
import * as recordsIntegrity from "../src/lib/iso-records-integrity.js";
import * as regulations from "../src/lib/regulations.js";
import * as requirements from "../src/lib/iso-requirements.js";
import * as standards from "../src/lib/standards.js";
import * as templates from "../src/lib/iso-templates.js";
import * as tenantStandards from "../src/lib/tenant-standards.js";

/**
 * Freeze the public surface of the legacy compliance barrels.
 * Refactors may move implementations under src/lib/compliance/, but these
 * re-export paths must keep the same named exports.
 */
const SURFACE: Record<string, readonly string[]> = {
  "iso-audit-plan": [
    "ISO_AUDIT_PLANS_REL",
    "AUDITOR_COMPETENCE_ID",
    "auditPlansPath",
    "loadAuditPlans",
    "saveAuditPlans",
    "findAuditPlan",
    "auditPlanDigest",
    "assessAuditorEligibility",
    "createAuditPlan",
    "setAuditFinding",
    "auditPlanProgress",
    "concludeAuditPlan",
    "recordAuditSignoff",
    "auditSignoffValid",
    "assessProgrammeCoverage",
    "formatAuditPlan",
  ],
  "iso-audit-precheck": [
    "proposePrecheckFindings",
    "applyPrecheckFindings",
    "buildAuditBrief",
    "assessFollowUp",
    "formatFollowUp",
  ],
  "iso-catalog": [
    "ISO_CATALOG_REL",
    "isoCatalogPath",
    "loadIsoCatalog",
    "listIsoCatalogEntries",
    "listAvailableIsoIds",
    "listComingSoonIsoEntries",
    "findIsoCatalogEntry",
    "inspectIsoMap",
    "listIsoMapStatuses",
    "verifyIsoMaps",
  ],
  "iso-clause-verification": ["summarizeClauseVerification", "formatClauseVerification"],
  "iso-internal-audit": [
    "ISO_INTERNAL_AUDIT_LOG_REL",
    "isoInternalAuditLogPath",
    "isoInternalAuditLatestReportPath",
    "evaluateIsoInternalAudit",
    "loadIsoInternalAuditRuns",
    "latestIsoInternalAuditRun",
    "persistIsoInternalAuditRun",
    "formatIsoInternalAuditReport",
    "runIsoInternalAudit",
  ],
  "iso-kpi": ["KPI_LOG_REL", "KPI_METRICS", "KPI_COLUMNS", "buildKpiReport", "formatKpiReport"],
  "iso-records": [
    "RECORD_SPEC_FILE",
    "recordSpecPath",
    "loadRecordSpecs",
    "recordRelPath",
    "checkRecord",
    "checkRecordsForStandard",
    "invalidRecordPaths",
    "formatRecordReports",
  ],
  "iso-records-integrity": ["collectIsoRecordIntegrityIssues"],
  "iso-requirements": [
    "REQUIREMENTS_FILE",
    "requirementsPath",
    "loadRequirements",
    "assessRequirementCoverage",
    "formatRequirementCoverage",
    "inScopeControlIds",
  ],
  "iso-templates": [
    "PACK_TEMPLATES_DIR",
    "CORE_TEMPLATES_DIR",
    "packTemplatesDir",
    "tenantEvidenceRel",
    "planIsoTemplateSync",
    "applyIsoTemplateSync",
  ],
  regulations: [
    "REGULATIONS_FILE",
    "TENANT_REGULATIONS_SUBDIR",
    "regulationsFilePath",
    "loadRegulationsCatalog",
    "loadTenantRegulationsFile",
    "getCatalogRegulation",
    "listEffectiveRegulations",
    "loadEnabledRegulationIds",
    "validateRegulations",
    "listCatalogRegulationIds",
    "seedRegulationDocs",
    "initTenantRegulationsRegistry",
  ],
  standards: [
    "STEWARD_STANDARDS_DIR",
    "STEWARD_ISO_DIR",
    "listIsoStandardIds",
    "getIsoStandardDir",
    "getIsoStandardIndexPath",
  ],
  "control-framework": [
    "CONTROL_FRAMEWORK_DIR",
    "TENANT_CONTROLS_REL",
    "controlsFilePath",
    "getControlMapPath",
    "CORE_MS_DIR",
    "coreControlMapPath",
    "coreProfilesPath",
    "loadCoreControls",
    "loadCoreProfile",
    "loadControlMapFile",
    "loadControlMapForStandard",
    "loadCoreBindingsForStandard",
    "loadControlMaps",
    "loadTenantControlStatus",
    "maturityRank",
    "isMaturityBelow",
    "missingEvidencePaths",
    "describeMissingEvidence",
    "hasEvidenceForControl",
    "listEffectiveControls",
    "controlsForAgent",
    "computeControlGaps",
    "formatControlStatusReport",
    "initTenantControlsFile",
    "setTenantControlMaturity",
    "getRegBindingsAbsPath",
  ],
  jsox: [
    "loadJsoxScope",
    "loadJsoxProcesses",
    "loadJsoxItgc",
    "jsoxStatus",
    "jsoxGaps",
    "jsoxEvaluate",
    "formatJsoxStatus",
  ],
  "tenant-standards": [
    "STANDARDS_FILE",
    "standardsFilePath",
    "loadTenantStandards",
    "loadEnabledIsoIds",
    "loadApplicableIsoIds",
    "loadIsoApplicability",
  ],
};

const MODULES: Record<string, Record<string, unknown>> = {
  "iso-audit-plan": auditPlan,
  "iso-audit-precheck": auditPrecheck,
  "iso-catalog": catalog,
  "iso-clause-verification": clauseVerification,
  "iso-internal-audit": internalAudit,
  "iso-kpi": kpi,
  "iso-records": records,
  "iso-records-integrity": recordsIntegrity,
  "iso-requirements": requirements,
  "iso-templates": templates,
  regulations,
  standards,
  "control-framework": controlFramework,
  jsox,
  "tenant-standards": tenantStandards,
};

describe("compliance layer contract", () => {
  for (const [name, exports] of Object.entries(SURFACE)) {
    it(`keeps legacy barrel exports for ${name}`, () => {
      const mod = MODULES[name]!;
      for (const key of exports) {
        expect(mod, `missing export ${key} from ${name}`).toHaveProperty(key);
        expect(mod[key], `${name}.${key} must be defined`).toBeDefined();
      }
    });
  }
});
