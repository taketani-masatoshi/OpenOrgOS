/**
 * Eco production evidence — strict cap gate (S-E5).
 * Raises ecosystem cap when Steward publish + Community integration verified.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";

export const ECO_STRICT_CAP_BASE = 80;
export const ECO_STRICT_CAP_STEWARD_PUBLISH = 92;
export const ECO_STRICT_CAP_COMMUNITY = 98;
export const ECO_STRICT_CAP_FULL = 99;

/** Checklist ecosystem cap without Community UI integration. */
export const ECO_READINESS_CAP_STEWARD = 95;
/** Checklist cap when Community integration flags verified. */
export const ECO_READINESS_CAP_COMMUNITY = 98;
/** Checklist cap when jurisdiction UI + vocabulary i18n verified. */
export const ECO_READINESS_CAP_FULL = 99;

const STEWARD_ECO_ARTIFACTS = [
  "publish/protocol/trusted-operators.yaml",
  "publish/protocol/community-readiness.json",
  "publish/protocol/community-sla.json",
  "src/lib/protocol/community-export.ts",
  "src/lib/protocol/eco-production-evidence.ts",
  "docs/org-os/steward-community-vocabulary.md",
  "docs/org-os/c4-community-epic-2026.md",
] as const;

export type CommunityIntegrationStatus = {
  steward_export?: boolean;
  community_ui?: boolean;
  sla_dashboard?: boolean;
  lifecycle_page?: boolean;
  trusted_operators_page?: boolean;
  governance_api?: boolean;
  e2e_green?: boolean;
  jurisdiction_registry_ui?: boolean;
  vocabulary_i18n?: boolean;
  tenant_mail_connect_api?: boolean;
  tenant_mail_connect_ui?: boolean;
  readiness_score?: number;
};

export type EcoProductionEvidence = {
  ok: boolean;
  cap: number;
  missing: string[];
  integration?: CommunityIntegrationStatus;
};

export function loadCommunityIntegration(root = getInstallRoot()): CommunityIntegrationStatus | undefined {
  const path = join(root, "publish/protocol/community-integration.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as CommunityIntegrationStatus;
  } catch {
    return undefined;
  }
}

export function computeEcoProductionEvidence(root = getInstallRoot()): EcoProductionEvidence {
  const missing: string[] = [];
  for (const rel of STEWARD_ECO_ARTIFACTS) {
    if (!existsSync(join(root, rel))) missing.push(rel);
  }

  const integration = loadCommunityIntegration(root);
  const stewardPublishOk = missing.length === 0 && integration?.steward_export === true;

  const communityOk =
    stewardPublishOk &&
    integration?.community_ui === true &&
    integration?.sla_dashboard === true &&
    integration?.lifecycle_page === true &&
    integration?.trusted_operators_page === true &&
    integration?.governance_api === true &&
    integration?.e2e_green === true;

  const fullOk =
    communityOk &&
    integration?.jurisdiction_registry_ui === true &&
    integration?.vocabulary_i18n === true;

  let cap = ECO_STRICT_CAP_BASE;
  if (fullOk) cap = ECO_STRICT_CAP_FULL;
  else if (communityOk) cap = ECO_STRICT_CAP_COMMUNITY;
  else if (stewardPublishOk) cap = ECO_STRICT_CAP_STEWARD_PUBLISH;

  return {
    ok: fullOk || communityOk,
    cap,
    missing,
    integration,
  };
}

export function resolveEcoStrictCap(): number {
  return computeEcoProductionEvidence().cap;
}

/** Checklist ecosystem score cap — aligned with strict cap tiers. */
export function resolveCommunityReadinessCap(root = getInstallRoot()): number {
  const eco = computeEcoProductionEvidence(root);
  if (eco.cap >= ECO_STRICT_CAP_FULL) return ECO_READINESS_CAP_FULL;
  if (eco.ok || eco.cap >= ECO_STRICT_CAP_COMMUNITY) return ECO_READINESS_CAP_COMMUNITY;
  if (eco.cap >= ECO_STRICT_CAP_STEWARD_PUBLISH) return ECO_READINESS_CAP_STEWARD;
  return ECO_READINESS_CAP_STEWARD;
}
