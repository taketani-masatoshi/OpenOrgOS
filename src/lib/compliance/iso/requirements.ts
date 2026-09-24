import { existsSync } from "node:fs";
import {
  isoRequirementsFileSchema,
  type IsoRequirement,
  type IsoRequirementsFile,
} from "../../../../schemas/iso-requirements.js";
import { listEffectiveControls } from "../controls/effective.js";
import { loadControlMaps } from "../controls/maps.js";
import { packFilePath } from "../packs/paths.js";
import { readYamlFile } from "../../utils.js";

export const REQUIREMENTS_FILE = "requirements.yaml";

export function requirementsPath(standard: string): string {
  return packFilePath(standard, REQUIREMENTS_FILE);
}

export interface RequirementCoverageRow extends IsoRequirement {
  standard: string;
  covered_by: string[];
  missing_controls: string[];
}

export interface RequirementCoverage {
  standard: string;
  requirements: RequirementCoverageRow[];
  uncovered: RequirementCoverageRow[];
  orphan_controls: string[];
  unverified: RequirementCoverageRow[];
  dangling: RequirementCoverageRow[];
}

export function loadRequirements(standard: string): IsoRequirementsFile | undefined {
  const path = requirementsPath(standard);
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, isoRequirementsFileSchema);
}

export function assessRequirementCoverage(standard: string): RequirementCoverage {
  const file = loadRequirements(standard);
  const controlIds = new Set(loadControlMaps([standard]).map((control) => control.id));
  const requirements = (file?.requirements ?? []).map((requirement): RequirementCoverageRow => ({
    ...requirement,
    standard,
    covered_by: requirement.controls.filter((id) => controlIds.has(id)),
    missing_controls: requirement.controls.filter((id) => !controlIds.has(id)),
  }));
  const claimed = new Set(requirements.flatMap((row) => row.covered_by));
  return {
    standard,
    requirements,
    uncovered: requirements.filter((row) => !row.covered_by.length),
    orphan_controls: [...controlIds].filter((id) => !claimed.has(id)).sort(),
    unverified: requirements.filter((row) => !row.verified_on),
    dangling: requirements.filter((row) => row.missing_controls.length > 0),
  };
}

export function formatRequirementCoverage(
  coverages: RequirementCoverage[],
  opts: { unverifiedOnly?: boolean } = {}
): string {
  if (!coverages.length) {
    return "要求事項レジスタ（requirements.yaml）がありません。";
  }
  const lines = [
    "# 要求事項への網羅性",
    "",
    "| 規格 | 要求事項 | 未被覆 | 孤立統制 | 未検証 | 参照切れ |",
    "|------|----------|--------|----------|--------|----------|",
  ];
  for (const coverage of coverages) {
    lines.push(
      `| ${coverage.standard} | ${coverage.requirements.length} | ${coverage.uncovered.length} | ` +
        `${coverage.orphan_controls.length} | ${coverage.unverified.length} | ${coverage.dangling.length} |`
    );
  }
  lines.push("");
  for (const coverage of coverages) {
    formatCoverageDetails(lines, coverage, opts.unverifiedOnly ?? false);
  }
  return lines.join("\n").trimEnd();
}

function formatCoverageDetails(
  lines: string[],
  coverage: RequirementCoverage,
  unverifiedOnly: boolean
): void {
  lines.push(`## ${coverage.standard}`, "");
  if (!coverage.requirements.length) {
    lines.push("要求事項が未記入です（器のみ）。", "");
    return;
  }
  if (unverifiedOnly) {
    lines.push("| 要求事項 | 箇条 | 内容 |", "|----------|------|------|");
    for (const row of coverage.unverified) {
      lines.push(`| ${row.id} | ${row.clause} | ${row.statement} |`);
    }
    lines.push("");
    return;
  }
  if (coverage.uncovered.length) {
    lines.push("### 未被覆の要求事項", "");
    for (const row of coverage.uncovered) {
      lines.push(`- ${row.id}（${row.clause}） ${row.statement}`);
    }
    lines.push("");
  }
  if (coverage.dangling.length) {
    lines.push("### 実在しない統制を参照している要求事項", "");
    for (const row of coverage.dangling) {
      lines.push(`- ${row.id}: ${row.missing_controls.join(", ")}`);
    }
    lines.push("");
  }
  if (coverage.orphan_controls.length) {
    lines.push("### どの要求事項にも紐づかない統制", "");
    for (const id of coverage.orphan_controls) lines.push(`- ${id}`);
    lines.push("");
  }
  if (coverage.unverified.length) {
    lines.push(
      `**未検証:** ${coverage.unverified.length} / ${coverage.requirements.length} 件。` +
        "statement は規格票の転記ではなく言い換えであり、突合するまで " +
        "本検査は「規格への網羅性」ではなく「想定した要求事項への網羅性」を示す。",
      ""
    );
  }
}

export function inScopeControlIds(): Set<string> {
  return new Set(
    listEffectiveControls()
      .filter((control) => control.in_scope)
      .map((control) => control.id)
  );
}
