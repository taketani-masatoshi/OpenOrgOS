import { listEffectiveRegulations, loadEnabledRegulationIds } from "./regulations.js";
import { loadEnabledIsoIds } from "./tenant-standards.js";
import { computeControlGaps } from "./control-framework.js";
import type { ControlGapRow } from "../../schemas/control-framework.js";

export type { ControlGapRow };

export interface ComplianceGapRow {
  id: string;
  name: string;
  gap_type: "missing_enable" | "enabled_but_blocked" | "doc_missing";
  iso_related: string[];
  detail: string;
}

export function computeComplianceGap(): {
  enabledIso: string[];
  effectiveRegs: string[];
  gaps: ComplianceGapRow[];
  control_gaps: ControlGapRow[];
} {
  const enabledIso = loadEnabledIsoIds();
  const effective = listEffectiveRegulations();
  const effectiveIds = loadEnabledRegulationIds();
  const gaps: ComplianceGapRow[] = [];

  for (const reg of effective) {
    const isoRelated =
      reg.catalog.iso_ids ??
      (reg.catalog.binds_to.type === "iso" ? [reg.catalog.binds_to.iso_id] : []);

    const bindRequires =
      reg.catalog.binds_to.type === "core" && reg.catalog.binds_to.group === "governance"
        ? true
        : reg.catalog.binds_to.type === "iso"
          ? enabledIso.includes(reg.catalog.binds_to.iso_id)
          : reg.catalog.binds_to.type === "iso_any"
            ? reg.catalog.binds_to.iso_ids.some((id) => enabledIso.includes(id))
            : reg.catalog.binds_to.type === "module"
              ? false // module binds handled separately
              : false;

    if (bindRequires && !reg.tenantEnabled) {
      gaps.push({
        id: reg.id,
        name: reg.name,
        gap_type: "missing_enable",
        iso_related: isoRelated,
        detail: "bind 充足 · テナント regulations.yaml で未有効化",
      });
      continue;
    }

    if (reg.tenantEnabled && !reg.effective && reg.blockReason) {
      gaps.push({
        id: reg.id,
        name: reg.name,
        gap_type: "enabled_but_blocked",
        iso_related: isoRelated,
        detail: reg.blockReason,
      });
    }
  }

  return { enabledIso, effectiveRegs: effectiveIds, gaps, control_gaps: computeControlGaps() };
}

export function formatComplianceGapReport(): string {
  const { enabledIso, effectiveRegs, gaps, control_gaps } = computeComplianceGap();
  const lines = [
    "# Compliance Gap — ISO × REG",
    "",
    `**有効 ISO:** ${enabledIso.join(", ") || "(none)"}`,
    `**有効 REG:** ${effectiveRegs.length} 件 — ${effectiveRegs.join(", ") || "(none)"}`,
    "",
    "## ギャップ",
    "",
  ];

  if (gaps.length === 0) {
    lines.push("ギャップなし ✓", "");
  } else {
    lines.push("| ID | 種別 | 規程 | 詳細 |", "|----|------|------|------|");
    for (const g of gaps) {
      lines.push(`| ${g.id} | ${g.gap_type} | ${g.name} | ${g.detail} |`);
    }
    lines.push("");
  }

  lines.push("## 統制ギャップ", "");
  if (control_gaps.length === 0) {
    lines.push("統制ギャップなし ✓", "");
  } else {
    lines.push("| CTL | 種別 | 統制 | 詳細 | Agent |", "|-----|------|------|------|-------|");
    for (const g of control_gaps) {
      lines.push(
        `| ${g.control_id} | ${g.gap_type} | ${g.title} | ${g.detail} | ${g.primary_agent} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
