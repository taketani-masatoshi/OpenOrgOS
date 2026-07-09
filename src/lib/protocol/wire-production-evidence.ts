/**
 * Wire production evidence — strict cap gate (W5).
 * Raises wireEvidence cap to 99 when mal pilot artifacts + deliver test exist.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getInstallRoot } from "../orgos-paths.js";

export const WIRE_STRICT_CAP_BASE = 91;
export const WIRE_STRICT_CAP_PRODUCTION = 99;

const MAL_PROTOCOL_FILES = [
  "tenants/mal/data/protocol/wire-gateway.yaml",
  "tenants/mal/data/protocol/peers.yaml",
  "tenants/mal/data/protocol/gov-gateway.yaml",
  "tenants/mal/data/protocol/witness-pool.yaml",
] as const;

const PRODUCTION_ARTIFACTS = [
  "deploy/mal-pilot/systemd/steward-protocol-relay@.service",
  "deploy/mal-pilot/systemd/steward-wire-gateway@.service",
  "deploy/mal-pilot/env/wire-gateway-mal.env.example",
  "scripts/install-mal-wire-systemd.sh",
  "scripts/setup-mal-wire-operator.sh",
  "tests/mal-wire-pilot-gate.test.ts",
  "tests/mal-wire-peer-deliver.test.ts",
] as const;

export type WireProductionEvidence = {
  ok: boolean;
  cap: number;
  missing: string[];
};

export function computeWireProductionEvidence(root = getInstallRoot()): WireProductionEvidence {
  const missing: string[] = [];
  for (const rel of [...MAL_PROTOCOL_FILES, ...PRODUCTION_ARTIFACTS]) {
    if (!existsSync(join(root, rel))) missing.push(rel);
  }
  const ok = missing.length === 0;
  return {
    ok,
    cap: ok ? WIRE_STRICT_CAP_PRODUCTION : WIRE_STRICT_CAP_BASE,
    missing,
  };
}
