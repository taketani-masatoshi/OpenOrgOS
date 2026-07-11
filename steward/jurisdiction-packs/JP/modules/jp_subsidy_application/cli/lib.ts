import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import {
  subsidyApplicationRegistryFileSchema,
  subsidyBriefFileSchema,
  subsidyFieldMapFileSchema,
  subsidyPersonnelCostBasisFileSchema,
  subsidyProgramsFileSchema,
  type SubsidyProgramsFile,
  type SubsidyRequirement,
} from "../../../../../../schemas/jp-subsidy.js";
import { loadCompany, loadEmployees } from "../../../../../../src/lib/data.js";
import {
  getModuleDataDir,
  isModuleEnabled,
  loadModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import { resolveTenantPath } from "../../../../../../src/lib/utils.js";
import { readYamlFile } from "../../../../../../src/lib/utils.js";

export const MODULE_ID = "jp_subsidy_application";

function loadSubsidyDataFile<S extends z.ZodTypeAny>(
  filename: string,
  schema: S
): { data: z.output<S>; path: string } | null {
  const loaded = loadModuleDataFile(MODULE_ID, filename, schema);
  if (!loaded) return null;
  return { data: schema.parse(loaded.data), path: loaded.path };
}

export interface CompanySnapshot {
  name: string;
  corporate_number?: string;
  representative?: string;
  address?: string;
  established_date?: string;
  business_description?: string;
  capital_yen?: number;
  employee_count_disclosed?: number;
  invoice_registration?: string;
}

export interface EligibilityResult {
  program_id: string;
  program_name: string;
  passed: boolean;
  checks: Array<{ id: string; label: string; ok: boolean; detail: string }>;
}

function loadCompanySnapshot(): CompanySnapshot {
  const company = loadCompany();
  const rawPath = resolveTenantPath("data/company.yaml");
  let extra: Record<string, unknown> = {};
  if (existsSync(rawPath)) {
    extra = YAML.parse(readFileSync(rawPath, "utf-8")) as Record<string, unknown>;
  }
  const disclosure = extra.public_disclosure as { capital_yen?: number; employees?: number } | undefined;
  const text = company.business_description ?? "";
  const invoiceMatch = text.match(/インボイス登録番号:\s*(T\d+)/);

  return {
    name: company.name,
    corporate_number: company.corporate_number,
    representative: company.representative,
    address: company.address,
    established_date: company.established_date,
    business_description: company.business_description,
    capital_yen: disclosure?.capital_yen,
    employee_count_disclosed: disclosure?.employees,
    invoice_registration: invoiceMatch?.[1],
  };
}

function activeEmployeeCount(): number {
  const hr = loadEmployees();
  const active = hr.employees.filter((e) => e.status === "active").length;
  if (active > 0) return active;
  const snap = loadCompanySnapshot();
  return snap.employee_count_disclosed ?? 0;
}

function resolveProgramRequirements(programId: string): {
  program: SubsidyProgramsFile["programs"][number];
  requirements: SubsidyRequirement[];
} | null {
  const programs = loadSubsidyDataFile("programs.yaml", subsidyProgramsFileSchema);
  if (!programs) return null;
  const program = programs.data.programs.find((p) => p.id === programId);
  if (!program) return null;

  const reqs = [...program.requirements];
  if (program.brief_path) {
    const briefPath = join(getModuleDataDir(MODULE_ID), program.brief_path);
    const briefCandidates = [
      briefPath,
      briefPath.replace(/\.yaml$/, ".yaml.example"),
      join(getModuleDataDir(MODULE_ID), "briefs", `${programId}.yaml`),
      join(getModuleDataDir(MODULE_ID), "briefs", `${programId}.yaml.example`),
    ];
    for (const p of briefCandidates) {
      if (!existsSync(p)) continue;
      const brief = readYamlFile(p, subsidyBriefFileSchema);
      for (const r of brief.requirements) {
        if (!reqs.some((x) => x.id === r.id)) reqs.push(r);
      }
      break;
    }
  }
  return { program, requirements: reqs };
}

function evaluateRequirement(
  req: SubsidyRequirement,
  snap: CompanySnapshot,
  employeeCount: number
): { ok: boolean; detail: string } {
  switch (req.rule) {
    case "requires_jurisdiction_jp": {
      const j = getResolvedJurisdiction().code;
      return j === "JP"
        ? { ok: true, detail: `jurisdiction=${j}` }
        : { ok: false, detail: `jurisdiction=${j} (JP required)` };
    }
    case "requires_corporate_number":
      return snap.corporate_number
        ? { ok: true, detail: "corporate_number present" }
        : { ok: false, detail: "corporate_number missing in company.yaml" };
    case "max_employees": {
      const max = req.max_value ?? 999999;
      return employeeCount <= max
        ? { ok: true, detail: `employees=${employeeCount} ≤ ${max}` }
        : { ok: false, detail: `employees=${employeeCount} > ${max}` };
    }
    case "min_employees": {
      const min = req.min_value ?? 0;
      return employeeCount >= min
        ? { ok: true, detail: `employees=${employeeCount} ≥ ${min}` }
        : { ok: false, detail: `employees=${employeeCount} < ${min}` };
    }
    case "max_capital_yen": {
      const max = req.max_value ?? Number.MAX_SAFE_INTEGER;
      if (snap.capital_yen == null) {
        return { ok: false, detail: "capital unknown — set company.public_disclosure.capital_yen or tax-profile" };
      }
      return snap.capital_yen <= max
        ? { ok: true, detail: `capital=¥${snap.capital_yen.toLocaleString()} ≤ ¥${max.toLocaleString()}` }
        : { ok: false, detail: `capital=¥${snap.capital_yen.toLocaleString()} > ¥${max.toLocaleString()}` };
    }
    case "manual":
      return { ok: false, detail: req.notes ?? "manual review required" };
    default:
      return { ok: false, detail: `unknown rule ${req.rule}` };
  }
}

export function runJpSubsidyShow(opts: { json?: boolean }): void {
  const programs = loadSubsidyDataFile("programs.yaml", subsidyProgramsFileSchema);
  const apps = loadSubsidyDataFile("application-registry.yaml", subsidyApplicationRegistryFileSchema);
  const open =
    programs?.data.programs.filter((p) => p.status !== "closed" && p.status !== "submitted") ?? [];
  const summary = {
    module: MODULE_ID,
    enabled: isModuleEnabled(MODULE_ID),
    jurisdiction: getResolvedJurisdiction().code,
    data_dir: getModuleDataDir(MODULE_ID),
    programs: programs?.data.programs.length ?? 0,
    tracking: open.length,
    applications: apps?.data.applications.length ?? 0,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# jp_subsidy_application\n`);
  console.log(
    `programs: ${summary.programs} · tracking: ${summary.tracking} · applications: ${summary.applications}`
  );
  console.log(`data: ${summary.data_dir} · jurisdiction: ${summary.jurisdiction}`);
}

export function runJpSubsidyValidate(): void {
  const issues: string[] = [];
  if (!isModuleEnabled(MODULE_ID)) issues.push("module not enabled in modules.yaml");
  if (getResolvedJurisdiction().code !== "JP") {
    issues.push("tenant jurisdiction is not JP");
  }
  if (!loadSubsidyDataFile("programs.yaml", subsidyProgramsFileSchema)) {
    issues.push("programs.yaml missing");
  }
  if (!loadSubsidyDataFile("field-map.yaml", subsidyFieldMapFileSchema)) {
    issues.push("field-map.yaml missing");
  }
  if (!loadSubsidyDataFile("personnel-cost-basis.yaml", subsidyPersonnelCostBasisFileSchema)) {
    issues.push("personnel-cost-basis.yaml missing");
  }
  if (issues.length) {
    console.error("✗ jp_subsidy_application:");
    for (const i of issues) console.error(`  - ${i}`);
    process.exit(1);
  }
  console.log("✓ jp_subsidy_application — subsidy data OK");
}

export function runJpSubsidyEligibility(opts: { program: string; json?: boolean }): void {
  const resolved = resolveProgramRequirements(opts.program);
  if (!resolved) {
    console.error(`Program ${opts.program} not found in programs.yaml`);
    process.exit(1);
  }
  const program = resolved.program;
  const snap = loadCompanySnapshot();
  const employeeCount = activeEmployeeCount();
  const checks = resolved.requirements.map((req) => {
    const { ok, detail } = evaluateRequirement(req, snap, employeeCount);
    return { id: req.id, label: req.label, ok, detail };
  });
  const passed = checks.length > 0 && checks.every((c) => c.ok);
  const result: EligibilityResult = {
    program_id: program.id,
    program_name: program.name,
    passed,
    checks,
  };
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`# Eligibility — ${program.id} ${program.name}\n`);
  if (program.source_url) console.log(`source: ${program.source_url}\n`);
  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.label}: ${c.detail}`);
  }
  console.log(`\n${passed ? "PASS" : "FAIL"} — human review required before applying`);
  if (!passed) process.exit(1);
}

export function runJpSubsidyLaborCost(opts: { program?: string; json?: boolean }): void {
  const basis = loadSubsidyDataFile("personnel-cost-basis.yaml", subsidyPersonnelCostBasisFileSchema);
  if (!basis) {
    console.error("personnel-cost-basis.yaml not found");
    process.exit(1);
  }
  const hr = loadEmployees();
  const hrMap = new Map(hr.employees.map((e) => [e.id, e]));
  const rows: Array<Record<string, unknown>> = [];

  for (const entry of basis.data.entries) {
    if (!entry.subsidy_eligible) continue;
    const emp = hrMap.get(entry.employee_id);
    const allocated = Math.round((entry.monthly_salary_yen * entry.allocation_pct) / 100);
    const hourly = allocated / basis.data.standard_hours_per_month;
    const burdened = Math.round(allocated * (1 + basis.data.overhead_rate_pct / 100));
    rows.push({
      employee_id: entry.employee_id,
      name: emp?.name ?? "(not in employees.yaml)",
      status: emp?.status ?? "unknown",
      role: entry.role_label,
      allocation_pct: entry.allocation_pct,
      monthly_salary_yen: entry.monthly_salary_yen,
      allocated_monthly_yen: allocated,
      hourly_yen: Math.round(hourly),
      burdened_monthly_yen: burdened,
    });
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          program: opts.program ?? null,
          as_of: basis.data.as_of,
          standard_hours_per_month: basis.data.standard_hours_per_month,
          overhead_rate_pct: basis.data.overhead_rate_pct,
          rows,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`# Personnel cost basis${opts.program ? ` — ${opts.program}` : ""}\n`);
  console.log(
    `standard ${basis.data.standard_hours_per_month}h/mo · overhead ${basis.data.overhead_rate_pct}%\n`
  );
  console.log("| ID | 氏名 | 役割 | 按分% | 月額 | 按分後 | 時間単価 | 間接費込 |");
  console.log("|---|---|---|---:|---:|---:|---:|---:|");
  for (const r of rows) {
    console.log(
      `| ${r.employee_id} | ${r.name} | ${r.role} | ${r.allocation_pct} | ¥${Number(r.monthly_salary_yen).toLocaleString()} | ¥${Number(r.allocated_monthly_yen).toLocaleString()} | ¥${Number(r.hourly_yen).toLocaleString()} | ¥${Number(r.burdened_monthly_yen).toLocaleString()} |`
    );
  }
  console.log("\n※ 給与単価は personnel-cost-basis.yaml（L2 は gitignore 推奨）· HR ID と突合");
}

function resolveFieldValue(source: string, snap: CompanySnapshot, employeeCount: number): string {
  const parts = source.split(".");
  if (parts[0] === "company") {
    const key = parts[1];
    if (key === "public_disclosure" && parts[2] === "capital_yen") {
      return snap.capital_yen != null ? String(snap.capital_yen) : "";
    }
    if (key === "invoice_registration") return snap.invoice_registration ?? "";
    const val = snap[key as keyof CompanySnapshot];
    return val != null ? String(val) : "";
  }
  if (parts[0] === "hr" && parts[1] === "active_employee_count") {
    return String(employeeCount);
  }
  return "";
}

export function runJpSubsidyDraft(opts: { program: string; json?: boolean }): void {
  const resolved = resolveProgramRequirements(opts.program);
  if (!resolved) {
    console.error(`Program ${opts.program} not found`);
    process.exit(1);
  }
  const program = resolved.program;
  const fieldMap = loadSubsidyDataFile("field-map.yaml", subsidyFieldMapFileSchema);
  const snap = loadCompanySnapshot();
  const employeeCount = activeEmployeeCount();
  const filled: Array<{ form_field: string; value: string; source: string }> = [];

  for (const m of fieldMap?.data.mappings ?? []) {
    let value = resolveFieldValue(m.source, snap, employeeCount);
    if (m.format && value && m.format.includes("{value")) {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        value = m.format.replace("{value:,}", num.toLocaleString()).replace("{value}", value);
      }
    }
    filled.push({ form_field: m.form_field, value, source: m.source });
  }

  if (opts.json) {
    console.log(JSON.stringify({ program_id: program.id, fields: filled }, null, 2));
    return;
  }

  console.log(`# Application draft scaffold — ${program.id}\n`);
  console.log(`## ${program.name}\n`);
  if (program.source_url) console.log(`募集: ${program.source_url}\n`);
  console.log("## 記載事項（自動差込 · 要人間確認）\n");
  for (const f of filled) {
    console.log(`- **${f.form_field}:** ${f.value || "—"} _(${f.source})_`);
  }
  console.log("\n## 人件費\n");
  console.log("`operations subsidy labor-cost --program " + program.id + "` を実行\n");
  console.log("## 適格性\n");
  console.log("`operations subsidy eligibility --program " + program.id + "` を実行\n");
  console.log("_最終稿は docs/subsidy/ 配下に保存 · L2 値の再掲禁止_");
}
