import type { BreachIncident } from "../../../../../../schemas/jp-data-breach.js";
import type { BreachAssessment } from "./assessment.js";

export interface ReportItem {
  no: number;
  label: string;
  value: string;
  missing: boolean;
}

/** 施行規則8条1項1〜9号 — 報告事項 */
export const REPORT_ITEM_LABELS = [
  "概要",
  "漏えい等が発生し、又は発生したおそれがある個人データの項目",
  "漏えい等が発生し、又は発生したおそれがある個人データに係る本人の数",
  "原因",
  "二次被害又はそのおそれの有無及びその内容",
  "本人への対応の実施状況",
  "公表の実施状況",
  "再発防止のための措置",
  "その他参考となる事項",
] as const;

/** 施行規則10条 — 本人通知の事項は8条1項1・2・4・5・9号 */
export const INDIVIDUAL_NOTICE_ITEM_NUMBERS = [1, 2, 4, 5, 9] as const;

const UNKNOWN_TEXT = "（未把握 — 判明次第追記）";

function orUnknown(value: string | undefined): { value: string; missing: boolean } {
  const trimmed = value?.trim();
  return trimmed ? { value: trimmed, missing: false } : { value: UNKNOWN_TEXT, missing: true };
}

function overviewText(
  incident: BreachIncident,
  assessment: BreachAssessment
): { value: string; missing: boolean } {
  const summary = orUnknown(incident.report_items?.summary);
  const entrustment = incident.is_entrustee
    ? `受託者として取扱い（委託元: ${incident.entrustor_ref ?? "未記載"}）`
    : "自社取扱い（委託関係は要確認）";
  const lines = [
    `- 発生日: ${incident.occurred_on ?? "不明"}`,
    `- 発覚日（知った日）: ${incident.known_on}`,
    `- 発見者: ${incident.discovered_by}`,
    `- 規則7条各号該当性: ${assessment.triggered_labels.join(" / ") || "該当なし（判定: " + assessment.status + "）"}`,
    `- 委託関係: ${entrustment}`,
    `- 事実経過: ${summary.value}`,
  ];
  return { value: lines.join("\n"), missing: summary.missing };
}

function dataItemsText(incident: BreachIncident): string {
  const subjects = incident.data_subject_categories.join("・") || "区分未記載";
  const medium = incident.report_items?.medium ?? "媒体未記載";
  return `${incident.data_items.join("、")}（${subjects} · ${medium}）`;
}

function affectedCountText(incident: BreachIncident): { value: string; missing: boolean } {
  const upper = incident.affected_count_upper_bound;
  if (incident.affected_count !== "unknown") {
    const upperNote =
      upper !== undefined ? `（最大 ${upper.toLocaleString("ja-JP")} 人のおそれ）` : "";
    return {
      value: `${incident.affected_count.toLocaleString("ja-JP")} 人${upperNote}`,
      missing: false,
    };
  }
  if (upper !== undefined)
    return { value: `不明（最大 ${upper.toLocaleString("ja-JP")} 人）`, missing: false };
  return { value: UNKNOWN_TEXT, missing: true };
}

function individualResponseText(incident: BreachIncident): { value: string; missing: boolean } {
  const parts: string[] = [];
  if (incident.individuals_notified_on)
    parts.push(`本人通知 実施: ${incident.individuals_notified_on}`);
  const alt = incident.notification_alternative;
  if (alt) parts.push(`代替措置（${alt.kind}）実施: ${alt.implemented_on} — 理由: ${alt.reason}`);
  const response = incident.report_items?.individual_response?.trim();
  if (response) parts.push(response);
  return parts.length
    ? { value: parts.join("\n"), missing: false }
    : { value: UNKNOWN_TEXT, missing: true };
}

function preventionText(incident: BreachIncident): { value: string; missing: boolean } {
  const done = incident.report_items?.prevention_done ?? [];
  const planned = incident.report_items?.prevention_planned ?? [];
  if (!done.length && !planned.length) return { value: UNKNOWN_TEXT, missing: true };
  const block = (title: string, list: readonly string[]) =>
    `${title}:\n${list.length ? list.map((m) => `  - ${m}`).join("\n") : "  - （なし）"}`;
  return { value: `${block("実施済み", done)}\n${block("実施予定", planned)}`, missing: false };
}

/** 施行規則8条1項各号の記載素材を組み立てる（未把握は missing=true · 確報では追完対象） */
export function buildReportItems(
  incident: BreachIncident,
  assessment: BreachAssessment
): ReportItem[] {
  const items = incident.report_items;
  const values = [
    overviewText(incident, assessment),
    { value: dataItemsText(incident), missing: false },
    affectedCountText(incident),
    orUnknown(items?.cause),
    orUnknown(items?.secondary_damage),
    individualResponseText(incident),
    orUnknown(items?.publication),
    preventionText(incident),
    orUnknown(items?.other_notes),
  ];
  return values.map((v, index) => ({ no: index + 1, label: REPORT_ITEM_LABELS[index], ...v }));
}
