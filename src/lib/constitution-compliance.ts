/**
 * Mechanical constitution compliance checks (ADR 0003 · A12 gate).
 * Evidence-based — no optimistic self-scoring without file/API proof.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "./utils.js";
import { assertEngineeringRulesComplete, validatePolicyMirrors } from "./operator-policy.js";
import { validateAgentPackExports } from "./agent-portability.js";
import { reduceCompanyEvents, loadCompanyEventChain } from "./company-events-chain.js";

export type ConstitutionAxisId =
  | "engineering_split"
  | "mirrors_ci"
  | "ssot"
  | "event_first"
  | "catalog_roster"
  | "layer"
  | "determinism"
  | "quality_gates"
  | "portability"
  | "docs_adr";

export type AxisGrade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "D" | "F";

export interface AxisCheckResult {
  id: ConstitutionAxisId;
  label: string;
  grade: AxisGrade;
  pass: boolean;
  evidence: string[];
  issues: string[];
}

export interface ConstitutionScoreReport {
  generated_at: string;
  axes: AxisCheckResult[];
  pass: boolean;
  /** Minimum grade for overall pass (A- or better on every axis). */
  min_grade: AxisGrade;
}

const GRADE_ORDER: AxisGrade[] = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "F"];

function gradeAtLeast(actual: AxisGrade, min: AxisGrade): boolean {
  return GRADE_ORDER.indexOf(actual) <= GRADE_ORDER.indexOf(min);
}

function fileExists(rel: string): boolean {
  return existsSync(join(ROOT_DIR, rel));
}

function readText(rel: string): string {
  return readFileSync(join(ROOT_DIR, rel), "utf8");
}

function checkEngineeringSplit(): AxisCheckResult {
  const evidence: string[] = [];
  const issues: string[] = [];
  try {
    assertEngineeringRulesComplete();
    evidence.push("assertEngineeringRulesComplete()");
  } catch (e) {
    issues.push(e instanceof Error ? e.message : String(e));
  }
  if (fileExists("steward/rules/openorgos-engineering-constitution.md")) {
    evidence.push("constitution index present");
  } else {
    issues.push("missing openorgos-engineering-constitution.md");
  }
  const engDir = join(ROOT_DIR, "steward", "rules", "engineering");
  const count = existsSync(engDir)
    ? readdirSync(engDir).filter((f) => f.endsWith(".md")).length
    : 0;
  evidence.push(`engineering/*.md count=${count}`);
  if (count < 10) issues.push("engineering split incomplete (<10 md)");
  const pass = issues.length === 0;
  return {
    id: "engineering_split",
    label: "1 Constitution split",
    grade: pass ? "A" : "C",
    pass,
    evidence,
    issues,
  };
}

function checkMirrorsCi(): AxisCheckResult {
  const evidence: string[] = [];
  const issues = validatePolicyMirrors();
  if (issues.length === 0) evidence.push("validatePolicyMirrors() clean");
  const wf = fileExists(".github/workflows/validate.yml")
    ? readText(".github/workflows/validate.yml")
    : "";
  if (wf.includes("generated:check")) evidence.push("CI generated:check");
  else issues.push("CI missing generated:check");
  if (wf.includes("format:check")) evidence.push("CI format:check");
  else issues.push("CI missing format:check");
  if (wf.includes("npm run lint")) evidence.push("CI lint");
  else issues.push("CI missing lint");
  const pass = issues.length === 0;
  return {
    id: "mirrors_ci",
    label: "2 Mirrors / CI",
    grade: pass ? "A" : "B",
    pass,
    evidence,
    issues,
  };
}

function checkSsot(): AxisCheckResult {
  const evidence: string[] = [];
  const issues: string[] = [];
  if (fileExists("src/lib/company-events-chain.ts")) {
    const body = readText("src/lib/company-events-chain.ts");
    if (body.includes("reduceCompanyEvents") && body.includes("CompanyEventChainRepository")) {
      evidence.push("company-events chain reduce + repository");
    } else {
      issues.push("company-events chain missing reduce/repository");
    }
  } else {
    issues.push("missing company-events-chain.ts");
  }
  if (fileExists("src/lib/company-events.ts")) {
    const body = readText("src/lib/company-events.ts");
    if (body.includes("materializeCompanyEventsFromChain")) {
      evidence.push("materializeCompanyEventsFromChain");
    } else {
      issues.push("missing materializeCompanyEventsFromChain");
    }
    if (body.includes("patchCompanyEventMarkdownFrontmatter")) {
      evidence.push("MD frontmatter patch (body never overwrite)");
    }
  }
  const pass = issues.length === 0;
  return {
    id: "ssot",
    label: "3 SSOT",
    grade: pass ? "A" : "B-",
    pass,
    evidence,
    issues,
  };
}

function checkEventFirst(): AxisCheckResult {
  const evidence: string[] = [];
  const issues: string[] = [];
  const markers: Array<[string, string]> = [
    ["src/lib/queue-db.ts", "appendQueueStatusEvent"],
    ["src/lib/protocol/delivery-ledger.ts", "DeliveryAttemptRepository"],
    ["src/lib/protocol/wire-queue.ts", "archiveWirePending"],
    ["docs/adr/0005-event-first-standard-patterns.md", "Accepted"],
  ];
  for (const [rel, needle] of markers) {
    if (fileExists(rel) && readText(rel).includes(needle)) {
      evidence.push(`${rel} · ${needle}`);
    } else {
      issues.push(`missing ${needle} in ${rel}`);
    }
  }
  if (fileExists("docs/adr/0007-non-event-domain-boundary.md")) {
    evidence.push("ADR 0007 non-event boundary");
  } else {
    issues.push("missing ADR 0007");
  }
  const pass = issues.length === 0;
  return {
    id: "event_first",
    label: "4 Event First",
    grade: pass ? "A" : "B",
    pass,
    evidence,
    issues,
  };
}

function checkCatalogRoster(): AxisCheckResult {
  const evidence: string[] = [];
  const issues: string[] = [];
  if (
    fileExists("src/lib/agent-activation.ts") &&
    readText("src/lib/agent-activation.ts").includes("isAgentActive")
  ) {
    evidence.push("agent-activation.isAgentActive");
  } else {
    issues.push("missing agent-activation.isAgentActive");
  }
  if (
    fileExists("src/lib/agent-roster.ts") &&
    readText("src/lib/agent-roster.ts").includes("isRosterAgentActive")
  ) {
    evidence.push("roster delegates activation");
  } else {
    issues.push("roster missing isRosterAgentActive");
  }
  const pass = issues.length === 0;
  return {
    id: "catalog_roster",
    label: "5 Catalog / Roster",
    grade: pass ? "A" : "B",
    pass,
    evidence,
    issues,
  };
}

function checkLayer(): AxisCheckResult {
  const evidence: string[] = [];
  const issues: string[] = [];
  const repos = [
    ["src/lib/protocol/delivery-ledger.ts", "DeliveryAttemptRepository"],
    ["src/lib/company-events-chain.ts", "CompanyEventChainRepository"],
  ];
  for (const [rel, needle] of repos) {
    if (fileExists(rel) && readText(rel).includes(needle)) evidence.push(needle);
    else issues.push(`missing ${needle}`);
  }
  // Application layer still thin — A- if repos exist, A only with protocol/commands
  const hasApp =
    fileExists("src/lib/protocol/commands") ||
    (fileExists("src/lib/protocol") &&
      readdirSync(join(ROOT_DIR, "src/lib/protocol")).some((f) => f.includes("command")));
  if (hasApp) evidence.push("protocol application commands present");
  const pass = issues.length === 0;
  return {
    id: "layer",
    label: "6 Layer",
    grade: pass ? (hasApp ? "A" : "A-") : "B-",
    pass,
    evidence,
    issues,
  };
}

function checkDeterminism(): AxisCheckResult {
  const evidence: string[] = [];
  const issues: string[] = [];
  if (fileExists("src/lib/runtime-context.ts")) {
    evidence.push("runtime-context.ts");
  } else {
    issues.push("missing runtime-context");
  }
  if (fileExists("docs/adr/0006-clock-id-injection-allowlist.md")) {
    evidence.push("ADR 0006 allowlist");
  } else {
    issues.push("missing ADR 0006");
  }
  if (fileExists("steward/rules/engineering/08-event-sourcing.md")) {
    const body = readText("steward/rules/engineering/08-event-sourcing.md");
    if (body.includes("allowlist") || body.includes("Allowlist")) {
      evidence.push("08-event-sourcing allowlist section");
    }
  }
  const pass = issues.length === 0;
  return {
    id: "determinism",
    label: "7 Determinism",
    grade: pass ? "A-" : "C+",
    pass,
    evidence,
    issues,
  };
}

function checkQualityGates(): AxisCheckResult {
  const evidence: string[] = [];
  const issues: string[] = [];
  if (fileExists("eslint.config.js")) {
    const cfg = readText("eslint.config.js");
    if (cfg.includes("downgradeToWarn")) {
      issues.push("eslint still uses downgradeToWarn");
    } else {
      evidence.push("eslint recommended as error");
    }
    if (cfg.includes("no-explicit-any") && cfg.includes("warn")) {
      evidence.push("no-explicit-any warn (staged)");
    }
  } else {
    issues.push("missing eslint.config.js");
  }
  if (fileExists(".prettierrc.json")) evidence.push(".prettierrc.json");
  else issues.push("missing prettier config");
  const pkg = fileExists("package.json") ? readText("package.json") : "";
  if (pkg.includes('"format:check"')) evidence.push("format:check script");
  else issues.push("missing format:check script");
  if (pkg.includes('"typecheck"')) evidence.push("typecheck script");
  else issues.push("missing typecheck script");
  const pass = issues.length === 0;
  return {
    id: "quality_gates",
    label: "8 Quality gates",
    grade: pass ? "A" : "B",
    pass,
    evidence,
    issues,
  };
}

function checkPortability(): AxisCheckResult {
  const evidence: string[] = [];
  const issues = validateAgentPackExports();
  if (issues.length === 0) evidence.push("validateAgentPackExports() clean");
  if (fileExists("steward/platform/agent/exports/INDEX.md")) {
    const index = readText("steward/platform/agent/exports/INDEX.md");
    if (index.includes("Engineering Constitution")) {
      evidence.push("INDEX engineering Path table");
    } else {
      issues.push("INDEX missing engineering Path table; run orgos operator export --all");
    }
  }
  const pass = issues.length === 0;
  return {
    id: "portability",
    label: "9 Portability",
    grade: pass ? "A" : "A-",
    pass,
    evidence,
    issues,
  };
}

function checkDocsAdr(): AxisCheckResult {
  const evidence: string[] = [];
  const issues: string[] = [];
  for (const adr of [
    "docs/adr/0005-event-first-standard-patterns.md",
    "docs/adr/0006-clock-id-injection-allowlist.md",
    "docs/adr/0007-non-event-domain-boundary.md",
  ]) {
    if (fileExists(adr)) evidence.push(adr);
    else issues.push(`missing ${adr}`);
  }
  if (fileExists("docs/framework-assessment.md")) evidence.push("framework-assessment.md");
  else issues.push("missing framework-assessment.md");
  const pass = issues.length === 0;
  return {
    id: "docs_adr",
    label: "10 Docs / ADR",
    grade: pass ? "A" : "B",
    pass,
    evidence,
    issues,
  };
}

export function evaluateConstitutionCompliance(opts?: {
  minGrade?: AxisGrade;
  /** When false, skip pack export freshness (faster unit smoke). Default true. */
  includePacks?: boolean;
}): ConstitutionScoreReport {
  const minGrade = opts?.minGrade ?? "A-";
  const axes: AxisCheckResult[] = [
    checkEngineeringSplit(),
    checkMirrorsCi(),
    checkSsot(),
    checkEventFirst(),
    checkCatalogRoster(),
    checkLayer(),
    checkDeterminism(),
    checkQualityGates(),
    opts?.includePacks === false
      ? {
          id: "portability",
          label: "9 Portability",
          grade: "A-",
          pass: true,
          evidence: ["skipped pack freshness"],
          issues: [],
        }
      : checkPortability(),
    checkDocsAdr(),
  ];

  const pass = axes.every((a) => a.pass && gradeAtLeast(a.grade, minGrade));
  return {
    generated_at: new Date().toISOString(),
    axes,
    pass,
    min_grade: minGrade,
  };
}

/** Smoke: reduce API is callable (tenant chain may be legacy/incomplete). */
export function smokeCompanyEventsReduce(): { ok: boolean; detail: string } {
  try {
    const chain = loadCompanyEventChain();
    const reduced = reduceCompanyEvents(chain);
    return {
      ok: true,
      detail: `links=${chain.length} events=${reduced.registry.events.length} complete=${reduced.complete}`,
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export function formatConstitutionScoreMarkdown(report: ConstitutionScoreReport): string {
  const lines = [
    "# Constitution compliance score",
    "",
    `Generated: ${report.generated_at}`,
    `Overall: ${report.pass ? "PASS" : "FAIL"} (min ${report.min_grade})`,
    "",
    "| Axis | Grade | Pass | Evidence | Issues |",
    "|------|:-----:|:----:|----------|--------|",
  ];
  for (const a of report.axes) {
    lines.push(
      `| ${a.label} | ${a.grade} | ${a.pass ? "✓" : "✗"} | ${a.evidence.slice(0, 2).join("; ") || "—"} | ${a.issues.slice(0, 2).join("; ") || "—"} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}
