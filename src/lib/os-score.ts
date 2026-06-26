/**
 * 会社 OS 総合スコア（OS-99+ Epic）
 * 正本: docs/framework-assessment.md §10
 * 製品点は framework-assessment §9 実測と手動同期
 */

import type { MaturityReport } from "./maturity.js";
import { listP0Items } from "./p0-status.js";
import { computeModuleAxisStats } from "./extensibility-contract.js";

/** framework-assessment §9 実測（REF-4b/d 完了 · 2026-06-25） */
export const PRODUCT_FRAMEWORK_SCORE = 100;

export interface Os99Score {
  product: number;
  preparedness: number;
  operational: number;
  automation: number;
  composite: number;
  grade: string;
  p0Blockers: number;
  gapTo99: number;
  gaps: string[];
}

const WEIGHTS = {
  product: 0.3,
  preparedness: 0.25,
  operational: 0.35,
  automation: 0.1,
} as const;

export function computeOs99Score(maturity: MaturityReport): Os99Score {
  const prep = maturity.preparedness.pct ?? 0;
  const ops = maturity.operational.pct ?? 0;
  const auto = maturity.automation.pct ?? 0;
  const product = PRODUCT_FRAMEWORK_SCORE;

  const composite = Math.round(
    product * WEIGHTS.product +
      prep * WEIGHTS.preparedness +
      ops * WEIGHTS.operational +
      auto * WEIGHTS.automation
  );

  const blockers = listP0Items().filter((i) => i.blocker && i.status !== "done");
  const gaps: string[] = [];

  if (blockers.length > 0) {
    gaps.push(`ops p0 ブロッカー ${blockers.length} 件（最大ギャップ）`);
  }
  if (product < 100) {
    gaps.push(`製品 ${product}/100 — framework-assessment §9 未達`);
  }
  const moduleAxis = computeModuleAxisStats();
  if (moduleAxis.activationReady > 0) {
    gaps.push(
      `業務 module ${moduleAxis.productionPct}% production_ready (${moduleAxis.activationReady} activation_ready)`
    );
  }
  if (ops < 95) {
    gaps.push(`運用度 ${ops}% — P0 実手続未完了`);
  }

  return {
    product,
    preparedness: prep,
    operational: ops,
    automation: auto,
    composite,
    grade: composite >= 99 ? "A+" : composite >= 90 ? "A" : composite >= 80 ? "B" : "C",
    p0Blockers: blockers.length,
    gapTo99: Math.max(0, 99 - composite),
    gaps,
  };
}

export function formatOs99Score(score: Os99Score, markdown = false): string {
  if (markdown) {
    return [
      "## 会社 OS 総合（OS-99）",
      "",
      `| 層 | 点数 | 重み |`,
      `|----|:----:|:----:|`,
      `| 製品（フレームワーク） | ${score.product} | 30% |`,
      `| MAL 準備度 | ${score.preparedness} | 25% |`,
      `| MAL 運用度 | ${score.operational} | 35% |`,
      `| MAL 自動化度 | ${score.automation} | 10% |`,
      `| **総合** | **${score.composite}** | 100% |`,
      "",
      `99+ まで: **${score.gapTo99} 点** · P0 ブロッカー: **${score.p0Blockers}**`,
      score.gaps.length ? `\nギャップ: ${score.gaps.join(" · ")}` : "",
    ].join("\n");
  }

  const lines = [
    `会社 OS 総合: ${score.composite}/100 (${score.grade}) — 99+ まで ${score.gapTo99} 点`,
    `  製品: ${score.product} · 準備: ${score.preparedness}% · 運用: ${score.operational}% · 自動: ${score.automation}%`,
    `  P0 ブロッカー: ${score.p0Blockers} 件`,
  ];
  if (score.gaps.length) {
    lines.push(`  ギャップ: ${score.gaps.join(" · ")}`);
  }
  lines.push("  正本: docs/framework-assessment.md §10 · docs/company/p0-closing-register.md");
  return lines.join("\n");
}
