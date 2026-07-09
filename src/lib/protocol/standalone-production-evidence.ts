/**
 * Standalone production evidence — strict cap gate (O2).
 * Raises standaloneLoop cap to 99 when Hub rotate timer + prod evidence scripts exist.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";

export const STANDALONE_STRICT_CAP_BASE = 97;
export const STANDALONE_STRICT_CAP_PRODUCTION = 99;

const PRODUCTION_ARTIFACTS = [
  "deploy/mal-pilot/systemd/steward-hub-signing-rotate@.timer",
  "deploy/mal-pilot/systemd/steward-hub-signing-rotate@.service",
  "scripts/hub-signing-rotate.sh",
  "scripts/standalone-prod-evidence.sh",
  "scripts/install-mal-wire-systemd.sh",
] as const;

export type StandaloneProductionEvidence = {
  ok: boolean;
  cap: number;
  missing: string[];
};

export function computeStandaloneProductionEvidence(root = getInstallRoot()): StandaloneProductionEvidence {
  const missing: string[] = [];
  for (const rel of PRODUCTION_ARTIFACTS) {
    if (!existsSync(join(root, rel))) missing.push(rel);
  }
  const ok = missing.length === 0;
  return {
    ok,
    cap: ok ? STANDALONE_STRICT_CAP_PRODUCTION : STANDALONE_STRICT_CAP_BASE,
    missing,
  };
}

export function resolveStandaloneStrictCap(): number {
  return computeStandaloneProductionEvidence().cap;
}
