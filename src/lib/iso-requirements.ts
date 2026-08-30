import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  isoRequirementsFileSchema,
  type IsoRequirement,
  type IsoRequirementsFile,
} from "../../schemas/iso-requirements.js";
import { listEffectiveControls, loadControlMaps } from "./control-framework.js";
import { STEWARD_ISO_DIR, STEWARD_STANDARDS_DIR } from "./standards.js";
import { JURISDICTION_PACKS_DIR } from "./steward-paths.js";
import { readYamlFile } from "./utils.js";

export const REQUIREMENTS_FILE = "requirements.yaml";

export function requirementsPath(standard: string): string {
  if (standard === "financial") {
    return join(STEWARD_STANDARDS_DIR, "audit", "financial", REQUIREMENTS_FILE);
  }
  if (standard === "jsox") {
    return join(JURISDICTION_PACKS_DIR, "JP", "modules", "jp_jsox", REQUIREMENTS_FILE);
  }
  return join(STEWARD_ISO_DIR, standard, REQUIREMENTS_FILE);
}

export interface RequirementCoverageRow extends IsoRequirement {
  standard: string;
  /** Referenced controls that exist in the loaded maps. */
  covered_by: string[];
  /** Referenced controls that do not exist — a dangling claim of coverage. */
  missing_controls: string[];
}

export interface RequirementCoverage {
  standard: string;
  requirements: RequirementCoverageRow[];
  /** Requirements no existing control is claimed to satisfy. */
  uncovered: RequirementCoverageRow[];
  /** Controls in the pack that no requirement points at. */
  orphan_controls: string[];
  /** Requirements whose wording has not been checked against the standard text. */
  unverified: RequirementCoverageRow[];
  /** Requirements referencing a control id that does not exist. */
  dangling: RequirementCoverageRow[];
}

export function loadRequirements(standard: string): IsoRequirementsFile | undefined {
  const path = requirementsPath(standard);
  if (!existsSync(path)) return undefined;
  return readYamlFile(path, isoRequirementsFileSchema);
}

/**
 * Compare requirements against controls in both directions.
 *
 * One direction alone is misleading: a pack can cover every requirement while
 * carrying controls nobody can trace to the standard, and it can have a control
 * per clause while individual shall-statements go unaddressed.
 */
export function assessRequirementCoverage(standard: string): RequirementCoverage {
  const file = loadRequirements(standard);
  const controls = loadControlMaps([standard]);
  const controlIds = new Set(controls.map((c) => c.id));

  const requirements: RequirementCoverageRow[] = (file?.requirements ?? []).map((req) => {
    const covered_by = req.controls.filter((id) => controlIds.has(id));
    const missing_controls = req.controls.filter((id) => !controlIds.has(id));
    return { ...req, standard, covered_by, missing_controls };
  });

  const claimed = new Set(requirements.flatMap((r) => r.covered_by));
  return {
    standard,
    requirements,
    uncovered: requirements.filter((r) => r.covered_by.length === 0),
    orphan_controls: [...controlIds].filter((id) => !claimed.has(id)).sort(),
    unverified: requirements.filter((r) => !r.verified_on),
    dangling: requirements.filter((r) => r.missing_controls.length > 0),
  };
}

export function formatRequirementCoverage(
  coverages: RequirementCoverage[],
  opts: { unverifiedOnly?: boolean } = {},
): string {
  if (coverages.length === 0) return "要求事項レジスタ（requirements.yaml）がありません。";

  const lines = ["# 要求事項への網羅性", ""];
  lines.push("| 規格 | 要求事項 | 未被覆 | 孤立統制 | 未検証 | 参照切れ |");
  lines.push("|------|----------|--------|----------|--------|----------|");
  for (const c of coverages) {
    lines.push(
      `| ${c.standard} | ${c.requirements.length} | ${c.uncovered.length} | ` +
        `${c.orphan_controls.length} | ${c.unverified.length} | ${c.dangling.length} |`,
    );
  }
  lines.push("");

  for (const c of coverages) {
    if (c.requirements.length === 0) {
      lines.push(`## ${c.standard}`, "", "要求事項が未記入です（器のみ）。", "");
      continue;
    }
    lines.push(`## ${c.standard}`, "");

    if (opts.unverifiedOnly) {
      lines.push("| 要求事項 | 箇条 | 内容 |");
      lines.push("|----------|------|------|");
      for (const r of c.unverified) lines.push(`| ${r.id} | ${r.clause} | ${r.statement} |`);
      lines.push("");
      continue;
    }

    if (c.uncovered.length > 0) {
      lines.push("### 未被覆の要求事項", "");
      for (const r of c.uncovered) lines.push(`- ${r.id}（${r.clause}） ${r.statement}`);
      lines.push("");
    }
    if (c.dangling.length > 0) {
      lines.push("### 実在しない統制を参照している要求事項", "");
      for (const r of c.dangling) {
        lines.push(`- ${r.id}: ${r.missing_controls.join(", ")}`);
      }
      lines.push("");
    }
    if (c.orphan_controls.length > 0) {
      lines.push("### どの要求事項にも紐づかない統制", "");
      for (const id of c.orphan_controls) lines.push(`- ${id}`);
      lines.push("");
    }
    if (c.unverified.length > 0) {
      lines.push(
        `**未検証:** ${c.unverified.length} / ${c.requirements.length} 件。` +
          "statement は規格票の転記ではなく言い換えであり、突合するまで " +
          "本検査は「規格への網羅性」ではなく「想定した要求事項への網羅性」を示す。",
        "",
      );
    }
  }
  return lines.join("\n").trimEnd();
}

/** Control ids in scope for the tenant, used to check a plan's audit scope. */
export function inScopeControlIds(): Set<string> {
  return new Set(listEffectiveControls().filter((c) => c.in_scope).map((c) => c.id));
}
