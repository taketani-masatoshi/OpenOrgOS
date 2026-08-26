import { isModuleEnabled } from "../module-business-data.js";
import { currentDate } from "../utils.js";
import {
  buildIrBriefingSummary,
  formatIrBriefingMarkdown,
  type IrBriefingSummary,
} from "./briefing.js";
import { IR_DIR_REL, IR_MODULE_ID } from "./constants.js";
import {
  irDataDirExists,
  loadIrCapTable,
  loadIrDisclosureCalendar,
  loadIrInvestorRegistry,
  loadIrMaterials,
} from "./load.js";

export type IrCoverage = "registered" | "unregistered" | "partial";

export interface IrBriefingView extends IrBriefingSummary {
  as_of: string;
  coverage: IrCoverage;
  source_path: string;
  module_enabled: boolean;
  notes: string[];
}

export function buildIrBriefingView(opts?: { asOf?: string }): IrBriefingView {
  const asOf = opts?.asOf ?? currentDate();
  const moduleEnabled = isModuleEnabled(IR_MODULE_ID);
  const notes: string[] = [];

  if (!irDataDirExists()) {
    return {
      as_of: asOf,
      coverage: "unregistered",
      source_path: IR_DIR_REL,
      module_enabled: moduleEnabled,
      cap_table_lines: 0,
      cap_table_ok: false,
      investor_contacts: 0,
      materials_count: 0,
      materials_in_review: 0,
      upcoming_disclosures: 0,
      overdue_disclosures: 0,
      notes: moduleEnabled
        ? [`未登録: ${IR_DIR_REL}/ にテナント YAML がありません（seed をコピー）。`]
        : ["IR モジュール無効 · テナントデータなし。"],
    };
  }

  const cap = loadIrCapTable();
  const registry = loadIrInvestorRegistry();
  const calendar = loadIrDisclosureCalendar();
  const materials = loadIrMaterials();

  const missing: string[] = [];
  if (!cap) missing.push("cap-table.yaml");
  if (!registry) missing.push("investor-registry.yaml");
  if (!calendar) missing.push("disclosure-calendar.yaml");
  if (!materials) missing.push("ir-materials.yaml");

  const coverage: IrCoverage =
    missing.length === 4 ? "unregistered" : missing.length > 0 ? "partial" : "registered";

  if (missing.length) {
    notes.push(`不足ファイル: ${missing.join(", ")}`);
  }

  const summary = buildIrBriefingSummary({
    capTable: cap?.data ?? null,
    registry: registry?.data ?? null,
    calendar: calendar?.data ?? null,
    materials: materials?.data ?? null,
    today: asOf,
  });

  return {
    ...summary,
    as_of: asOf,
    coverage,
    source_path: IR_DIR_REL,
    module_enabled: moduleEnabled,
    notes,
  };
}

export function formatIrBriefingTodayLines(view: IrBriefingView): string[] {
  if (view.coverage === "unregistered") {
    return [
      `- 被覆: 未登録（${view.source_path}/）`,
      `- モジュール: ${view.module_enabled ? "有効" : "無効"}`,
      ...view.notes.map((note) => `- ${note}`),
    ];
  }

  return [
    `- cap table: ${view.cap_table_lines} 行 · 検証 ${view.cap_table_ok ? "OK" : "要確認"}`,
    `- 投資家連絡先索引: ${view.investor_contacts}`,
    `- IR 資料: ${view.materials_count}（draft/in_review ${view.materials_in_review}）`,
    `- 開示（90日）: upcoming ${view.upcoming_disclosures} · overdue ${view.overdue_disclosures}`,
    `- Path: \`${view.source_path}/\``,
    ...view.notes.map((note) => `- 注記: ${note}`),
  ];
}

export function formatIrCeoReply(view: IrBriefingView): string {
  if (view.coverage === "unregistered") {
    return [
      "# IR briefing",
      "",
      view.notes[0] ?? "IR データ未登録。",
      "",
      `Path: ${view.source_path}/`,
    ].join("\n");
  }

  return formatIrBriefingMarkdown(view, { today: view.as_of });
}
