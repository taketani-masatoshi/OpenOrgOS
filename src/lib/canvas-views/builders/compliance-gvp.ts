import type { CanvasViewModel } from "../../../../schemas/canvas-view.js";
import {
  attentionBoardLinks,
  attentionEmptyCallout,
  omitNote,
} from "../../attention/index.js";
import {
  buildGvpPortfolio,
  listGvpDecisions,
} from "../../medical-device/gvp-portfolio.js";
import { formatUpdatedAtJst } from "../../secretary/canvas-sync-shared.js";
import { getTenantId } from "../../tenant.js";
import { currentDate } from "../../utils.js";

export function buildComplianceGvpViewModel(opts?: {
  updatedAt?: string;
  tenant?: string;
  reportDate?: string;
  companyName?: string;
}): CanvasViewModel {
  const tenant = opts?.tenant?.trim() || getTenantId() || "mal";
  const updatedAt = opts?.updatedAt?.trim() || formatUpdatedAtJst();
  const reportDate = opts?.reportDate?.trim() || currentDate();
  const company = opts?.companyName?.trim() || "MAL";
  const portfolio = buildGvpPortfolio({ today: reportDate });
  const s = portfolio.stats;
  const decisions = listGvpDecisions(portfolio);

  const sections: CanvasViewModel["sections"] = [];
  if (!portfolio.enabled) {
    sections.push({
      type: "callout",
      tone: "neutral",
      title: "jp_medical_device モジュール無効",
      body: "テナントで jp_medical_device を有効化すると GVP ボードが出ます。",
    });
  } else {
    const hot =
      s.open_adverse_events +
      s.open_complaints +
      s.open_inquiries +
      s.overdue_gvp_reports +
      s.missing;
    sections.push({
      type: "callout",
      tone: hot > 0 ? "warning" : "success",
      title: decisions.length ? "いま決めること（GVP）" : "GVP は安定",
      body: [
        `文書不足 ${s.missing}`,
        `苦情 open ${s.open_complaints}`,
        `AE open ${s.open_adverse_events}`,
        `照会 open ${s.open_inquiries}`,
        `報告期限超過 ${s.overdue_gvp_reports}`,
        omitNote(decisions.length, portfolio.rows.length),
      ]
        .filter(Boolean)
        .join(" · "),
    });
    sections.push({
      type: "stats",
      items: [
        {
          value: String(s.overdue_gvp_reports),
          label: "報告期限超過",
          tone: s.overdue_gvp_reports ? "danger" : "success",
        },
        {
          value: String(s.open_adverse_events),
          label: "AE open",
          tone: s.open_adverse_events ? "danger" : "success",
        },
        {
          value: String(s.open_complaints),
          label: "苦情 open",
          tone: s.open_complaints ? "warning" : "neutral",
        },
        {
          value: String(s.open_inquiries),
          label: "照会 open",
          tone: s.open_inquiries ? "warning" : "neutral",
        },
      ],
    });
    if (decisions.length) {
      sections.push({
        type: "table",
        title: "いま決めること",
        headers: ["ID", "内容", "種別", "状態", "次の一手"],
        rows: decisions.map((r) => [
          r.id,
          r.title,
          r.kind,
          r.status,
          r.next_action,
        ]),
      });
    } else {
      sections.push(
        attentionEmptyCallout(
          "GVP は安定",
          "必須 GVP 手順書と open 苦情/AE の要判断はありません。"
        )
      );
    }
  }

  return {
    version: 1,
    tenant,
    suite: "compliance",
    view_id: "gvp",
    updated_at: updatedAt,
    report_date: reportDate,
    title: "医療機器 GVP（CEO）",
    summary: decisions[0]
      ? `先頭: ${decisions[0].id}`
      : portfolio.enabled
        ? `不足 ${s.missing}`
        : "モジュール無効",
    eyebrow: company,
    subtitle: `${reportDate} · md-gvp · REG-026 · Web/Cursor 同一VM`,
    sections,
    links: attentionBoardLinks({ tenant, domainKey: "md_gvp" }),
  };
}

export function assertComplianceGvpViewModelNoL2(vm: CanvasViewModel): void {
  const blob = JSON.stringify(vm);
  for (const re of [/許可番号/, /〒\d{3}/, /@gmail/i, /口座/]) {
    if (re.test(blob)) throw new Error(`gvp VM L2: ${re}`);
  }
}
