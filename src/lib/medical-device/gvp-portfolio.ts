/**
 * CEO projection over medical-device GVP docs + open complaint/AE (L1).
 */
import { CEO_ATTENTION_CANVAS_DEFAULTS } from "../attention/index.js";
import { currentDate } from "../utils.js";
import { collectGvpSignals } from "./compliance-signals.js";

export type GvpPortfolioRow = {
  id: string;
  title: string;
  kind: string;
  status: string;
  next_action: string;
  attention_score: number;
};

export type GvpPortfolio = {
  as_of: string;
  enabled: boolean;
  rows: GvpPortfolioRow[];
  stats: {
    required: number;
    covered: number;
    missing: number;
    open_complaints: number;
    open_adverse_events: number;
    open_inquiries: number;
    overdue_gvp_reports: number;
  };
};

export function buildGvpPortfolio(opts?: { today?: string }): GvpPortfolio {
  const today = opts?.today?.trim() || currentDate();
  const sig = collectGvpSignals();
  if (!sig.enabled) {
    return {
      as_of: today,
      enabled: false,
      rows: [],
      stats: {
        required: 0,
        covered: 0,
        missing: 0,
        open_complaints: 0,
        open_adverse_events: 0,
        open_inquiries: 0,
        overdue_gvp_reports: 0,
      },
    };
  }
  const rows: GvpPortfolioRow[] = [];
  for (const d of sig.missing_required) {
    rows.push({
      id: d.id,
      title: d.title.slice(0, 80),
      kind: "文書",
      status: "文書未整備",
      next_action: `operations medical-device gvp draft --doc ${d.id} --write`,
      attention_score: d.id === "GVP-001" ? 55 : 40,
    });
  }
  if (sig.overdue_gvp_reports > 0) {
    rows.push({
      id: "md-gvp-ae-overdue",
      title: `有害事象 報告期限超過 ${sig.overdue_gvp_reports}件`,
      kind: "報告",
      status: "期限超過",
      next_action: "AE を評価し人間が PMDA 報告（operations medical-device gvp escalate）",
      attention_score: 70,
    });
  }
  if (sig.open_adverse_events > 0) {
    rows.push({
      id: "md-gvp-ae-open",
      title: `有害事象 未クローズ ${sig.open_adverse_events}件`,
      kind: "報告",
      status: "要対応",
      next_action: "AE 台帳を評価・報告しクローズ（人間提出）",
      attention_score: 60,
    });
  }
  if (sig.open_complaints > 0) {
    rows.push({
      id: "md-gvp-complaint-open",
      title: `苦情 未クローズ ${sig.open_complaints}件`,
      kind: "苦情",
      status: "要対応",
      next_action: "苦情台帳を評価し是正・クローズ",
      attention_score: 50,
    });
  }
  if (sig.open_inquiries > 0) {
    rows.push({
      id: "md-gvp-inquiry-open",
      title: `当局照会 未クローズ ${sig.open_inquiries}件`,
      kind: "照会",
      status: "要対応",
      next_action: "operations medical-device inquiry list --open",
      attention_score: 55,
    });
  }
  rows.sort((a, b) => b.attention_score - a.attention_score);
  return {
    as_of: today,
    enabled: true,
    rows: rows.slice(0, CEO_ATTENTION_CANVAS_DEFAULTS.maxRows),
    stats: {
      required: sig.required,
      covered: sig.covered,
      missing: sig.missing_required.length,
      open_complaints: sig.open_complaints,
      open_adverse_events: sig.open_adverse_events,
      open_inquiries: sig.open_inquiries,
      overdue_gvp_reports: sig.overdue_gvp_reports,
    },
  };
}

export function listGvpDecisions(
  portfolio: GvpPortfolio,
  limit = CEO_ATTENTION_CANVAS_DEFAULTS.maxDecisions
): GvpPortfolioRow[] {
  return portfolio.rows.filter((r) => r.attention_score >= 30).slice(0, limit);
}
