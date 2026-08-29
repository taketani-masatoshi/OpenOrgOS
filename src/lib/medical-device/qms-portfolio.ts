/**
 * CEO projection over medical-device QMS document coverage (L1).
 */
import { CEO_ATTENTION_CANVAS_DEFAULTS } from "../attention/index.js";
import { currentDate } from "../utils.js";
import { collectQmsSignals } from "./compliance-signals.js";

export type QmsPortfolioRow = {
  id: string;
  title: string;
  tier: string;
  status: string;
  next_action: string;
  attention_score: number;
};

export type QmsPortfolio = {
  as_of: string;
  enabled: boolean;
  rows: QmsPortfolioRow[];
  stats: {
    required: number;
    covered: number;
    missing: number;
    document_control_entries: number;
    open_capa: number;
    open_changes: number;
  };
};

export function buildQmsPortfolio(opts?: { today?: string }): QmsPortfolio {
  const today = opts?.today?.trim() || currentDate();
  const sig = collectQmsSignals();
  if (!sig.enabled) {
    return {
      as_of: today,
      enabled: false,
      rows: [],
      stats: {
        required: 0,
        covered: 0,
        missing: 0,
        document_control_entries: 0,
        open_capa: 0,
        open_changes: 0,
      },
    };
  }
  const rows: QmsPortfolioRow[] = [];
  for (const d of sig.missing_required) {
    const tier = d.tier ?? "?";
    const score = tier === "1" ? 55 : 40;
    rows.push({
      id: d.id,
      title: d.title.slice(0, 80),
      tier,
      status: "文書未整備",
      next_action: `operations medical-device qms draft --doc ${d.id} --write`,
      attention_score: score,
    });
  }
  if (
    sig.missing_required.length > 0 &&
    sig.document_control_entries === 0
  ) {
    rows.push({
      id: "md-qms-doc-control",
      title: "文書管理台帳が空（必須文書未登録）",
      tier: "—",
      status: "台帳未整備",
      next_action: "document-control 台帳に承認記録を追加",
      attention_score: 35,
    });
  }
  if (sig.open_capa > 0) {
    rows.push({
      id: "md-qms-capa-open",
      title: `CAPA 未クローズ ${sig.open_capa}件`,
      tier: "—",
      status: "要対応",
      next_action: "operations medical-device capa list --open",
      attention_score: 50,
    });
  }
  if (sig.open_changes > 0) {
    rows.push({
      id: "md-qms-change-open",
      title: `変更管理 未クローズ ${sig.open_changes}件`,
      tier: "—",
      status: "要対応",
      next_action: "operations medical-device change list --open",
      attention_score: 45,
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
      document_control_entries: sig.document_control_entries,
      open_capa: sig.open_capa,
      open_changes: sig.open_changes,
    },
  };
}

export function listQmsDecisions(
  portfolio: QmsPortfolio,
  limit = CEO_ATTENTION_CANVAS_DEFAULTS.maxDecisions
): QmsPortfolioRow[] {
  return portfolio.rows.filter((r) => r.attention_score >= 30).slice(0, limit);
}
