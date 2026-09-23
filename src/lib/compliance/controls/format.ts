import type { EffectiveControl } from "../../../../schemas/control-framework.js";
import { listEffectiveControls } from "./effective.js";
import { computeControlGaps } from "./gaps.js";

export function formatControlStatusReport(): string {
  const controls = listEffectiveControls().filter((control) => control.in_scope);
  const gaps = computeControlGaps();
  const byDomain = new Map<string, EffectiveControl[]>();
  for (const control of controls) {
    const domainControls = byDomain.get(control.domain) ?? [];
    domainControls.push(control);
    byDomain.set(control.domain, domainControls);
  }

  const lines = [
    "# Control Status — ISO × REG 統制",
    "",
    `**スコープ内統制:** ${controls.length} 件`,
    `**ギャップ:** ${gaps.length} 件`,
    "",
    "## 成熟度サマリ",
    "",
    "| ドメイン | L0 | L1 | L2 | L3 | L4 |",
    "|----------|----|----|----|----|-----|",
  ];
  for (const [domain, domainControls] of [...byDomain.entries()].sort()) {
    const counts = { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0 };
    for (const control of domainControls) counts[control.tenant_maturity]++;
    lines.push(
      `| ${domain} | ${counts.L0} | ${counts.L1} | ${counts.L2} | ${counts.L3} | ${counts.L4} |`
    );
  }

  lines.push("", "## ギャップ", "");
  if (!gaps.length) {
    lines.push("ギャップなし ✓", "");
  } else {
    lines.push("| CTL | 種別 | 統制 | 詳細 | Agent |", "|-----|------|------|------|-------|");
    for (const item of gaps) {
      lines.push(
        `| ${item.control_id} | ${item.gap_type} | ${item.title} | ${item.detail} | ${item.primary_agent} |`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
