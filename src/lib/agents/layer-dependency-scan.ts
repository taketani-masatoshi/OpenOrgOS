/**
 * Scan relative imports among Agent-infra modules and report upward edges
 * plus hard rule violations from the refactor plan.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  AGENT_INFRA_FILE_LAYER,
  AGENT_INFRA_LAYER_RANK,
  listAgentInfraScopedFiles,
  resolveAgentInfraFileLayer,
  type AgentInfraLayer,
} from "./layer-catalog.js";
import { ROOT_DIR } from "../tenant.js";

const IMPORT_RE = /(?:from|import)\s+["'](\.[^"']+)["']/g;

const TRACKED_PEERS = ["src/lib/agent-pulse.ts", "src/lib/agent-workspace.ts"] as const;

export interface AgentInfraLayerEdge {
  from: string;
  fromLayer: AgentInfraLayer;
  to: string;
  toLayer: AgentInfraLayer;
}

export function formatAgentInfraLayerEdge(edge: AgentInfraLayerEdge): string {
  return `${edge.from} (${edge.fromLayer}) -> ${edge.to} (${edge.toLayer})`;
}

function resolveRelativeImport(fromAbs: string, specifier: string): string | null {
  const cleaned = specifier.replace(/\.js$/, "");
  const candidates = [
    resolve(dirname(fromAbs), `${cleaned}.ts`),
    resolve(dirname(fromAbs), join(cleaned, "index.ts")),
  ];
  for (const candidate of candidates) {
    const rel = relative(ROOT_DIR, candidate).replace(/\\/g, "/");
    if (resolveAgentInfraFileLayer(rel)) return rel;
  }
  return null;
}

function scanFiles(): string[] {
  const scoped = listAgentInfraScopedFiles().map((rel) => join(ROOT_DIR, rel));
  const peers = TRACKED_PEERS.map((rel) => join(ROOT_DIR, rel)).filter((abs) => existsSync(abs));
  return [...scoped, ...peers];
}

export function collectAgentInfraLayerUpwardEdges(): AgentInfraLayerEdge[] {
  const edges: AgentInfraLayerEdge[] = [];

  for (const abs of scanFiles()) {
    const fromRel = relative(ROOT_DIR, abs).replace(/\\/g, "/");
    const fromLayer = resolveAgentInfraFileLayer(fromRel);
    if (!fromLayer) continue;

    const text = readFileSync(abs, "utf-8");
    IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_RE.exec(text)) !== null) {
      const toRel = resolveRelativeImport(abs, match[1]!);
      if (!toRel) continue;
      const toLayer = resolveAgentInfraFileLayer(toRel);
      if (!toLayer) continue;
      if (AGENT_INFRA_LAYER_RANK[toLayer] > AGENT_INFRA_LAYER_RANK[fromLayer]) {
        edges.push({ from: fromRel, fromLayer, to: toRel, toLayer });
      }
    }
  }

  return edges;
}

export function collectAgentInfraLayerViolationKeys(): string[] {
  return [...new Set(collectAgentInfraLayerUpwardEdges().map(formatAgentInfraLayerEdge))].sort();
}

/** Hard rules from the plan (independent of rank). */
export function collectAgentInfraHardRuleViolations(): string[] {
  const issues: string[] = [];
  for (const abs of scanFiles()) {
    const fromRel = relative(ROOT_DIR, abs).replace(/\\/g, "/");
    const fromLayer = resolveAgentInfraFileLayer(fromRel);
    if (!fromLayer) continue;
    const text = readFileSync(abs, "utf-8");
    IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_RE.exec(text)) !== null) {
      const toRel = resolveRelativeImport(abs, match[1]!);
      if (!toRel) continue;
      const toLayer = resolveAgentInfraFileLayer(toRel);
      if (!toLayer) continue;

      if (fromLayer === "llm_pool" && toLayer !== "llm_pool") {
        issues.push(`llm_pool must not import agent-infra: ${fromRel} -> ${toRel}`);
      }
      if (fromLayer === "aia" && (toLayer === "orchestration" || toLayer === "dispatch")) {
        issues.push(`aia must not import ${toLayer}: ${fromRel} -> ${toRel}`);
      }
      if (fromLayer === "reporting" && toLayer === "orchestration") {
        issues.push(`reporting must not import orchestration: ${fromRel} -> ${toRel}`);
      }
    }
  }
  return [...new Set(issues)].sort();
}

/**
 * Known long cycles that leave Agent-infra (documented, not fully enumerated).
 * Keys are stable labels — presence of the seed import is checked.
 */
export const AGENT_INFRA_KNOWN_EXTERNAL_CYCLE_SEEDS = [
  {
    id: "notifications_push_via_today_context",
    from: "src/lib/notifications/push.ts",
    importContains: "steward-chat/today-context",
  },
  {
    id: "agent_summaries_via_dashboard",
    from: "src/lib/agent-summaries.ts",
    importContains: "./dashboard.js",
  },
] as const;

export function collectMissingKnownExternalCycleSeeds(): string[] {
  const missing: string[] = [];
  for (const seed of AGENT_INFRA_KNOWN_EXTERNAL_CYCLE_SEEDS) {
    const abs = join(ROOT_DIR, seed.from);
    if (!existsSync(abs)) {
      missing.push(`${seed.id}: missing ${seed.from}`);
      continue;
    }
    const text = readFileSync(abs, "utf-8");
    if (!text.includes(seed.importContains)) {
      missing.push(`${seed.id}: ${seed.from} no longer imports ${seed.importContains}`);
    }
  }
  return missing;
}

/** Ensure catalog keys stay aligned with AGENT_INFRA_FILE_LAYER for agents/ splits. */
export function assertAgentsSubtreeCatalogued(): string[] {
  return Object.keys(AGENT_INFRA_FILE_LAYER)
    .filter((rel) => rel.startsWith("src/lib/agents/"))
    .filter((rel) => !existsSync(join(ROOT_DIR, rel)))
    .map((rel) => `missing catalogued agents path: ${rel}`);
}
