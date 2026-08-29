import { loadControlMaps } from "./control-framework.js";
import { loadEnabledIsoIds } from "./tenant-standards.js";

export interface ClauseRefRow {
  control_id: string;
  title: string;
  standard: string;
  clause: string;
  edition?: string;
  verified_on?: string;
  verified_by?: string;
}

export interface ClauseVerificationSummary {
  standards: string[];
  rows: ClauseRefRow[];
  verified: number;
  unverified: number;
}

/**
 * Clause numbers are a mapping the pack asserts, not text it may reproduce.
 * Until someone checks a ref against a licensed copy of the standard and stamps
 * `verified_on`, the audit trail should show it as an assumption.
 */
export function summarizeClauseVerification(standards?: string[]): ClauseVerificationSummary {
  const enabled = standards ?? loadEnabledIsoIds();
  const scope = new Set(enabled);
  const rows: ClauseRefRow[] = [];
  for (const ctrl of loadControlMaps(enabled)) {
    for (const ref of ctrl.iso_refs) {
      if (!scope.has(ref.standard)) continue;
      rows.push({
        control_id: ctrl.id,
        title: ctrl.title,
        standard: ref.standard,
        clause: ref.clause,
        edition: ref.edition,
        verified_on: ref.verified_on,
        verified_by: ref.verified_by,
      });
    }
  }
  rows.sort(
    (a, b) =>
      a.standard.localeCompare(b.standard) ||
      a.clause.localeCompare(b.clause, undefined, { numeric: true }) ||
      a.control_id.localeCompare(b.control_id),
  );
  const verified = rows.filter((r) => r.verified_on).length;
  return { standards: enabled, rows, verified, unverified: rows.length - verified };
}

export function formatClauseVerification(summary: ClauseVerificationSummary): string {
  const lines = [
    "# 条項番号の検証状況",
    "",
    `**対象規格:** ${summary.standards.join(", ") || "（有効な規格なし）"}`,
    `**参照数:** ${summary.rows.length} · 検証済 ${summary.verified} · 未検証 ${summary.unverified}`,
    "",
  ];
  if (summary.rows.length === 0) return lines.join("\n");

  lines.push("| 規格 | 条項 | 版 | CTL | 検証 |");
  lines.push("|------|------|----|-----|------|");
  for (const row of summary.rows) {
    const state = row.verified_on
      ? `${row.verified_on}${row.verified_by ? ` / ${row.verified_by}` : ""}`
      : "未検証";
    lines.push(
      `| ${row.standard} | ${row.clause} | ${row.edition ?? "—"} | ${row.control_id} | ${state} |`,
    );
  }
  lines.push(
    "",
    "## 検証のしかた",
    "",
    "ISO 本文は再配布できないため、パックは条項番号を仮の対応として持つ。購入した規格票と",
    "突き合わせたら、control-map.yaml の該当 `iso_refs` / `core_bindings` に",
    "`verified_on` と `verified_by` を追記する。未検証のまま外部監査の根拠にしない。",
  );
  return lines.join("\n");
}
