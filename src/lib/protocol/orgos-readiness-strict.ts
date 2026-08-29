/**
 * OrgOS strict scoring — operational caps (framework-assessment §13 · orgos-scoring-methodology.md).
 * Do not conflate with checklist score from orgos-readiness.ts.
 */
import { computeModuleAxisStats } from "../extensibility-contract.js";
import { computeCommunityReadiness } from "./community-readiness.js";
import { computeOrgOsReadiness, type OrgOsReadinessReport } from "./orgos-readiness.js";
import { computeWireProductionEvidence } from "./wire-production-evidence.js";
import {
  computeEcoProductionEvidence,
  resolveEcoStrictCap,
  ECO_STRICT_CAP_COMMUNITY,
  ECO_STRICT_CAP_FULL,
} from "./eco-production-evidence.js";
import { resolveStandaloneStrictCap } from "./standalone-production-evidence.js";

/** Steward-side ecosystem cap without OS_Community app. */
export const STEWARD_ECOSYSTEM_STRICT_CAP = 80;

/** Per-axis operational caps (see docs/org-os/orgos-scoring-methodology.md). */
export const ORGOS_STRICT_AXIS_CAPS = {
  /** Base cap; raised to 99 when computeStandaloneProductionEvidence().ok */
  standaloneLoop: 97,
  formUnification: 90,
  /** Base cap; raised to 99 when computeWireProductionEvidence().ok */
  wireEvidence: 91,
} as const;

export function resolveStandaloneStrictCapFromEvidence(): number {
  return resolveStandaloneStrictCap();
}

export function resolveWireStrictCap(): number {
  return computeWireProductionEvidence().cap;
}

export function computeOrgOsStrictReadiness(): OrgOsReadinessReport {
  const checklist = computeOrgOsReadiness();
  const moduleAxis = computeModuleAxisStats();
  const ecoEvidence = computeEcoProductionEvidence();
  const ecoCap = resolveEcoStrictCap();
  const ecosystemScore = Math.min(computeCommunityReadiness().score, ecoCap);
  const standaloneCap = resolveStandaloneStrictCap();

  const standaloneLoop = {
    ...checklist.standaloneLoop,
    score: Math.min(checklist.standaloneLoop.score, standaloneCap),
  };
  const formUnification = {
    ...checklist.formUnification,
    score: Math.min(checklist.formUnification.score, ORGOS_STRICT_AXIS_CAPS.formUnification),
  };
  const wireCap = resolveWireStrictCap();
  const wireEvidence = {
    ...checklist.wireEvidence,
    score: Math.min(checklist.wireEvidence.score, wireCap),
  };
  const interfaceAxis = {
    ...checklist.interfaceAxis,
    score: Math.min(moduleAxis.coreProductionPct, checklist.interfaceAxis.score),
  };
  const ecosystem = {
    ...checklist.ecosystem,
    score: ecosystemScore,
  };

  const weighted = Math.round(
    standaloneLoop.score * 0.35 +
      formUnification.score * 0.25 +
      interfaceAxis.score * 0.15 +
      wireEvidence.score * 0.15 +
      ecosystem.score * 0.1
  );

  const gaps = [
    ...checklist.gaps.filter(
      (g) => !g.includes("OS_Community") && !g.includes("module production_ready 93")
    ),
    `厳格: Eco ${ecosystemScore}% cap ${ecoCap}${
      ecoCap >= ECO_STRICT_CAP_FULL
        ? "（Community 統合 + jurisdiction + i18n OK）"
        : ecoCap >= ECO_STRICT_CAP_COMMUNITY
          ? "（Community 統合 OK）"
          : ecoCap >= 92
            ? "（Steward publish OK · Community UI 待ち）"
            : "（OS_Community 未実装）"
    }`,
    `厳格: IF ${interfaceAxis.score}% = module production_ready 実測（換算なし）`,
    wireCap >= 99
      ? "厳格: Wire 本番証跡 OK（mal pilot · relay/Gateway systemd · peer deliver · W1–W4）"
      : "厳格: Wire 本番証跡不足 — mal protocol · systemd · peer deliver テスト未完了",
    standaloneCap >= 99
      ? "厳格: standalone 本番証跡 OK（Hub rotate timer · prod evidence script）"
      : "厳格: standalone cap 99 — Hub 鍵ローテ timer 本番 enable · 7日 uptime",
  ];

  if (!ecoEvidence.integration?.jurisdiction_registry_ui) {
    gaps.push("厳格: committee 法域レジストリ UI — Community /protocol/jurisdiction");
  }
  if (ecoCap < ECO_STRICT_CAP_FULL) {
    gaps.push("厳格: Eco 99+ — vocabulary i18n 8 locale · 本番 SLA 7日");
  }

  return {
    standaloneLoop,
    formUnification,
    interfaceAxis,
    wireEvidence,
    ecosystem,
    weighted,
    gaps,
  };
}
