/**
 * 予算・予実ボード（部門予算 + 事業セグメント予実グラフ）
 * 組織権限は org-authority に分離。
 */
import type {
  CanvasViewModel,
  CanvasViewTableCell,
} from "../../../../schemas/canvas-view.js";
import {
  buildOrgAuthorityRows,
  loadOrgAuthority,
  sumAuthorityBudgets,
} from "../../org/org-authority.js";
import { formatUpdatedAtJst } from "../../secretary/canvas-sync-shared.js";
import { getTenantId } from "../../tenant.js";
import { currentDate } from "../../utils.js";
import { computeVarianceReport } from "../../variance.js";

function formatMan(n: number): string {
  return `${n.toLocaleString("ja-JP")}万円`;
}

function yenToMan(yen: number): number {
  return Math.round(yen / 10_000);
}

function shortSegmentLabel(name: string): string {
  const t = name.trim();
  if (t.length <= 10) return t;
  return `${t.slice(0, 9)}…`;
}

export function buildOrgBudgetViewModel(opts?: {
  updatedAt?: string;
  tenant?: string;
  reportDate?: string;
  companyName?: string;
}): CanvasViewModel {
  const tenant = opts?.tenant?.trim() || getTenantId() || "mal";
  const updatedAt = opts?.updatedAt?.trim() || formatUpdatedAtJst();
  const reportDate = opts?.reportDate?.trim() || currentDate();
  const company = opts?.companyName?.trim() || "MAL";
  const auth = loadOrgAuthority();
  const rows = buildOrgAuthorityRows(auth);
  const sums = auth
    ? sumAuthorityBudgets(auth)
    : { plan: 0, actual: 0, burn_pct: null as number | null };

  let fy = auth?.fiscal_year || "FY2026";
  let varianceOk = false;
  let planTotalMan = 0;
  let actualTotalMan = 0;
  let deltaTotalMan = 0;
  let segmentCategories: string[] = [];
  let segmentPlan: number[] = [];
  let segmentActual: number[] = [];
  let segmentRows: CanvasViewTableCell[][] = [];

  try {
    const v = computeVarianceReport(fy);
    fy = v.fiscalYear;
    varianceOk = true;
    planTotalMan = yenToMan(v.planTotal);
    actualTotalMan = yenToMan(v.actualTotal);
    deltaTotalMan = yenToMan(v.deltaTotal);
    const segs = v.segments.slice(0, 8);
    segmentCategories = segs.map((s) => shortSegmentLabel(s.segment));
    segmentPlan = segs.map((s) => yenToMan(s.planTotal));
    segmentActual = segs.map((s) => yenToMan(s.actualTotal));
    segmentRows = segs.map((s) => {
      const deltaMan = yenToMan(s.delta);
      const deltaCell: CanvasViewTableCell =
        deltaMan > 0
          ? { text: `+${formatMan(deltaMan)}`, tone: "success" }
          : deltaMan < 0
            ? { text: formatMan(deltaMan), tone: "warning" }
            : formatMan(0);
      return [
        s.segment,
        formatMan(yenToMan(s.planTotal)),
        formatMan(yenToMan(s.actualTotal)),
        deltaCell,
      ];
    });
  } catch {
    /* variance unavailable */
  }

  const sections: CanvasViewModel["sections"] = [
    {
      type: "stats",
      items: [
        {
          value: formatMan(sums.plan),
          label: "部門予算合計",
          tone: "info",
        },
        {
          value: formatMan(sums.actual),
          label: "部門実績合計",
        },
        {
          value: sums.burn_pct != null ? `${sums.burn_pct}%` : "—",
          label: "部門消化率",
          tone:
            sums.burn_pct != null && sums.burn_pct >= 90
              ? "warning"
              : "success",
        },
        {
          value: varianceOk ? formatMan(planTotalMan) : "—",
          label: "全社計画（売上）",
          tone: "info",
        },
        {
          value: varianceOk ? formatMan(actualTotalMan) : "—",
          label: "全社実績（売上）",
        },
        {
          value: varianceOk
            ? `${deltaTotalMan >= 0 ? "+" : ""}${formatMan(deltaTotalMan)}`
            : "—",
          label: "全社差異",
          tone:
            !varianceOk
              ? undefined
              : deltaTotalMan >= 0
                ? "success"
                : "warning",
        },
      ],
    },
  ];

  if (varianceOk && segmentCategories.length > 0) {
    sections.push({
      type: "bars",
      title: "事業セグメント予実（万円）",
      categories: segmentCategories,
      series: [
        { name: "計画", data: segmentPlan },
        { name: "実績", data: segmentActual },
      ],
    });
    sections.push({
      type: "table",
      title: "セグメント内訳",
      headers: ["セグメント", "計画", "実績", "差異"],
      rows: segmentRows,
    });
  } else {
    sections.push({
      type: "callout",
      tone: "warning",
      title: "全社予実なし",
      body: "事業セグメントの計画・実績を表示できません。",
    });
  }

  if (rows.length > 0) {
    const top = [...rows]
      .sort((a, b) => b.budget_plan_man - a.budget_plan_man)
      .slice(0, 8);
    sections.push({
      type: "bars",
      title: "部門予算 vs 実績（万円）",
      categories: top.map((r) => shortSegmentLabel(r.unit_label)),
      series: [
        { name: "予算", data: top.map((r) => r.budget_plan_man) },
        { name: "実績", data: top.map((r) => r.budget_actual_man) },
      ],
    });
    sections.push({
      type: "table",
      title: "部門予算執行",
      headers: ["部門", "予算", "実績", "消化率"],
      rows: rows.map((r) => [
        r.unit_label,
        formatMan(r.budget_plan_man),
        formatMan(r.budget_actual_man),
        r.burn_pct != null
          ? r.burn_pct >= 90
            ? { text: `${r.burn_pct}%`, tone: "warning" as const }
            : `${r.burn_pct}%`
          : "—",
      ]),
    });
  } else {
    sections.push({
      type: "callout",
      tone: "info",
      title: "部門予算なし",
      body: "部門別の予算枠は未登録です。",
    });
  }

  return {
    version: 1,
    tenant,
    suite: "executive",
    view_id: "org-budget",
    updated_at: updatedAt,
    report_date: reportDate,
    title: "予算・予実",
    summary: auth
      ? `部門消化 ${sums.burn_pct ?? "—"}% · 全社差異 ${
          varianceOk
            ? `${deltaTotalMan >= 0 ? "+" : ""}${formatMan(deltaTotalMan)}`
            : "—"
        }`
      : "未登録",
    eyebrow: company,
    subtitle: auth ? `${fy} · ${auth.as_of}` : fy,
    sections,
    links: {
      web_path: `/t/${tenant}/e/org-budget`,
    },
  };
}

export function assertOrgBudgetViewModelNoL2(vm: CanvasViewModel): void {
  const blob = JSON.stringify(vm);
  for (const re of [/口座/, /@gmail/i, /〒\d{3}/, /tenants\//]) {
    if (re.test(blob)) {
      throw new Error(`org-budget view model L2/path pattern: ${re}`);
    }
  }
}
