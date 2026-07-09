/**
 * OrgOS strict scoring — operational caps (framework-assessment §13 · orgos-scoring-methodology.md).
 * Do not conflate with checklist score from orgos-readiness.ts.
 */
import { computeModuleAxisStats } from "../extensibility-contract.js";
import { computeCommunityReadiness } from "./community-readiness.js";
import { computeOrgOsReadiness, type OrgOsReadinessReport } from "./orgos-readiness.js";
import { computeWireProductionEvidence } from "./wire-production-evidence.js";

/** Steward-side ecosystem cap without OS_Community app. */
export const STEWARD_ECOSYSTEM_STRICT_CAP = 80;

/** Per-axis operational caps (see docs/org-os/orgos-scoring-methodology.md). */
export const ORGOS_STRICT_AXIS_CAPS = {
  standaloneLoop: 97,
  formUnification: 90,
  /** Base cap; raised to 99 when computeWireProductionEvidence().ok */
  wireEvidence: 91,
} as const;

export function resolveWireStrictCap(): number {
  return computeWireProductionEvidence().cap;
}

export function computeOrgOsStrictReadiness(): OrgOsReadinessReport {
  const checklist = computeOrgOsReadiness();
  const moduleAxis = computeModuleAxisStats();
  const ecosystemScore = Math.min(computeCommunityReadiness().score, STEWARD_ECOSYSTEM_STRICT_CAP);

  const standaloneLoop = {
    ...checklist.standaloneLoop,
    score: Math.min(checklist.standaloneLoop.score, ORGOS_STRICT_AXIS_CAPS.standaloneLoop),
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
    score: moduleAxis.productionPct,
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
    `厳格: Eco ${ecosystemScore}% cap ${STEWARD_ECOSYSTEM_STRICT_CAP}（OS_Community 未実装）`,
    `厳格: IF ${interfaceAxis.score}% = module production_ready 実測（換算なし）`,
    wireCap >= 99
      ? "厳格: Wire 本番証跡 OK（mal pilot · relay/Gateway systemd · peer deliver）"
      : "厳格: Wire 本番証跡不足 — mal protocol · systemd · peer deliver テスト未完了",
    "厳格: Hub 鍵自動ローテ本番常駐 · committee 法域レジストリ UI — 未",
  ];

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
