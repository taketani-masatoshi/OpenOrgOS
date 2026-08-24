import type { CanvasViewModel } from "../../../../schemas/canvas-view.js";
import {
  attentionBoardLinks,
  attentionEmptyCallout,
  omitNote,
} from "../../attention/index.js";
import {
  buildQmsPortfolio,
  listQmsDecisions,
} from "../../medical-device/qms-portfolio.js";
import { formatUpdatedAtJst } from "../../secretary/canvas-sync-shared.js";
import { getTenantId } from "../../tenant.js";
import { currentDate } from "../../utils.js";

export function buildComplianceQmsViewModel(opts?: {
  updatedAt?: string;
  tenant?: string;
  reportDate?: string;
  companyName?: string;
}): CanvasViewModel {
  const tenant = opts?.tenant?.trim() || getTenantId() || "mal";
  const updatedAt = opts?.updatedAt?.trim() || formatUpdatedAtJst();
  const reportDate = opts?.reportDate?.trim() || currentDate();
  const company = opts?.companyName?.trim() || "MAL";
  const portfolio = buildQmsPortfolio({ today: reportDate });
  const s = portfolio.stats;
  const decisions = listQmsDecisions(portfolio);

  const sections: CanvasViewModel["sections"] = [];
  if (!portfolio.enabled) {
    sections.push({
      type: "callout",
      tone: "neutral",
      title: "jp_medical_device モジュール無効",
      body: "テナントで jp_medical_device を有効化すると QMS ボードが出ます。",
    });
  } else {
    sections.push({
      type: "callout",
      tone: s.missing > 0 ? "warning" : "success",
      title: decisions.length ? "いま決めること（QMS）" : "QMS 文書は充足",
      body: [
        `必須 ${s.required}`,
        `整備済 ${s.covered}`,
        `不足 ${s.missing}`,
        `文書管理台帳 ${s.document_control_entries}件`,
        omitNote(decisions.length, portfolio.rows.length),
      ]
        .filter(Boolean)
        .join(" · "),
    });
    sections.push({
      type: "stats",
      items: [
        {
          value: String(s.missing),
          label: "文書不足",
          tone: s.missing ? "warning" : "success",
        },
        {
          value: `${s.covered}/${s.required}`,
          label: "カバレッジ",
          tone: s.missing ? "info" : "success",
        },
        {
          value: String(s.document_control_entries),
          label: "文書台帳",
          tone: s.document_control_entries ? "neutral" : "info",
        },
        {
          value: String(decisions.length),
          label: "要判断",
          tone: decisions.length ? "info" : "neutral",
        },
      ],
    });
    if (decisions.length) {
      sections.push({
        type: "table",
        title: "いま決めること",
        headers: ["ID", "文書", "階層", "状態", "次の一手"],
        rows: decisions.map((r) => [
          r.id,
          r.title,
          r.tier,
          r.status,
          r.next_action,
        ]),
      });
    } else {
      sections.push(
        attentionEmptyCallout(
          "QMS 文書は充足",
          "tier1–2 の必須文書は docs/medical-device/qms/ に揃っています。"
        )
      );
    }
  }

  return {
    version: 1,
    tenant,
    suite: "compliance",
    view_id: "qms",
    updated_at: updatedAt,
    report_date: reportDate,
    title: "医療機器 QMS（CEO）",
    summary: decisions[0]
      ? `先頭: ${decisions[0].id}`
      : portfolio.enabled
        ? `不足 ${s.missing}`
        : "モジュール無効",
    eyebrow: company,
    subtitle: `${reportDate} · md-qms · REG-025 · Web/Cursor 同一VM`,
    sections,
    links: attentionBoardLinks({ tenant, domainKey: "md_qms" }),
  };
}

export function assertComplianceQmsViewModelNoL2(vm: CanvasViewModel): void {
  const blob = JSON.stringify(vm);
  for (const re of [/許可番号/, /〒\d{3}/, /@gmail/i, /口座/]) {
    if (re.test(blob)) throw new Error(`qms VM L2: ${re}`);
  }
}
