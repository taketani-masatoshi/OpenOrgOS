import { loadControlMaps } from "../controls/maps.js";
import { loadEnabledIsoIds } from "../standards/tenant.js";

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

export function summarizeClauseVerification(standards?: string[]): ClauseVerificationSummary {
  const enabled = standards ?? loadEnabledIsoIds();
  const scope = new Set(enabled);
  const rows = loadControlMaps(enabled)
    .flatMap((control) =>
      control.iso_refs
        .filter((ref) => scope.has(ref.standard))
        .map((ref): ClauseRefRow => ({
          control_id: control.id,
          title: control.title,
          standard: ref.standard,
          clause: ref.clause,
          edition: ref.edition,
          verified_on: ref.verified_on,
          verified_by: ref.verified_by,
        }))
    )
    .sort(
      (left, right) =>
        left.standard.localeCompare(right.standard) ||
        left.clause.localeCompare(right.clause, undefined, {
          numeric: true,
        }) ||
        left.control_id.localeCompare(right.control_id)
    );
  const verified = rows.filter((row) => row.verified_on).length;
  return {
    standards: enabled,
    rows,
    verified,
    unverified: rows.length - verified,
  };
}

export function formatClauseVerification(summary: ClauseVerificationSummary): string {
  const lines = [
    "# 条項番号の検証状況",
    "",
    `**対象規格:** ${summary.standards.join(", ") || "（有効な規格なし）"}`,
    `**参照数:** ${summary.rows.length} · 検証済 ${summary.verified} · 未検証 ${summary.unverified}`,
    "",
  ];
  if (!summary.rows.length) return lines.join("\n");

  lines.push("| 規格 | 条項 | 版 | CTL | 検証 |", "|------|------|----|-----|------|");
  for (const row of summary.rows) {
    const state = row.verified_on
      ? `${row.verified_on}${row.verified_by ? ` / ${row.verified_by}` : ""}`
      : "未検証";
    lines.push(
      `| ${row.standard} | ${row.clause} | ${row.edition ?? "—"} | ${row.control_id} | ${state} |`
    );
  }
  lines.push(
    "",
    "## 検証のしかた",
    "",
    "ISO 本文は再配布できないため、パックは条項番号を仮の対応として持つ。購入した規格票と",
    "突き合わせたら、control-map.yaml の該当 `iso_refs` / `core_bindings` に",
    "`verified_on` と `verified_by` を追記する。未検証のまま外部監査の根拠にしない。"
  );
  return lines.join("\n");
}
