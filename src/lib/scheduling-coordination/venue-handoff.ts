import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { getDocsDir } from "../utils.js";

/**
 * Venue Booking 専門 Agent 向け handoff（Secretary → Operations）。
 * KPI は Secretary quality_signals と分離（VR 完了率は venue-reservations SoT）。
 */
export function writeVenueBookingHandoff(caseRow: SchedulingCase): string {
  const dir = join(getDocsDir(), "reports", "routing-queue");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `venue-handoff-${caseRow.id}.md`);
  const firstPick =
    caseRow.venue_options.find((o) => o.first_pick)?.name ?? caseRow.location ?? "（未定）";
  const body = [
    `# Venue Booking handoff — ${caseRow.id}`,
    "",
    `**案件:** ${caseRow.title}`,
    `**形式:** ${caseRow.meeting_format}`,
    `**第一候補:** ${firstPick}`,
    `**エリア:** ${caseRow.venue_area ?? "—"}`,
    "",
    "## 会場案（CEO 確認済み）",
    "",
    ...caseRow.venue_options.map(
      (o) => `- ${o.id}. ${o.name}${o.facts ? ` — ${o.facts}` : ""}${o.first_pick ? " 【第一候補】" : ""}`
    ),
    "",
    "## CLI（優先: Hotpepper deep-link）",
    "",
    "```bash",
    `npm run orgos -- operations venue reserve --case ${caseRow.id} \\`,
    `  --venue VENUE-001 --provider hotpepper_deep_link \\`,
    `  --request-id ${caseRow.id}-hp-1`,
    "# 人手予約後:",
    `npm run orgos -- operations venue confirm --id VR-YYYY-NNN \\`,
    `  --external-ref <本番予約番号> --approval-id APR-…`,
    "# 計測・証明用 (LIVE-MEASURE / HP-PROOF / REH- / PROOF-) はデモ時のみ --allow-measurement-ref",
    "# Hot Pepper 本番番号: 数字を含む 6 文字以上",
    "```",
    "",
    "## 依頼",
    "",
    "- 第一候補で Hotpepper 深リンク → 空席確認 · 予約",
    "- `external_ref`（予約番号）を VR SoT に記録 → 確定メールに反映",
    "- 実行は CEO 承認後（`org approval`）",
    "",
    "## 境界",
    "",
    "- **Venue Booking KPI**（予約完了・VR 状態）≠ **Secretary KPI**（文案指摘 · quality_signals）",
    "",
    `**生成:** ${new Date().toISOString()}`,
    "",
  ].join("\n");
  writeFileSync(path, body, "utf-8");
  return path;
}
