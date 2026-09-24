/**
 * Scan relative imports among protocol layer modules and report upward edges.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  PROTOCOL_LAYER_RANK,
  resolveProtocolFileLayer,
  type ProtocolLayer,
} from "./layer-catalog.js";
import { ROOT_DIR } from "../tenant.js";

const IMPORT_RE = /(?:from|import)\s+["'](\.[^"']+)["']/g;

function listTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      listTsFiles(abs, out);
      continue;
    }
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(abs);
    }
  }
  return out;
}

function resolveShimTarget(absTs: string): string | null {
  if (!existsSync(absTs)) return null;
  const text = readFileSync(absTs, "utf-8");
  const match = text.match(/Compatibility shim[\s\S]*?export \* from ["'](\.\/[^"']+)["']/);
  if (!match) return null;
  const target = resolve(dirname(absTs), match[1]!.replace(/\.js$/, ".ts"));
  return relative(ROOT_DIR, target).replace(/\\/g, "/");
}

function resolveRelativeImport(fromAbs: string, specifier: string): string | null {
  const cleaned = specifier.replace(/\.js$/, "");
  const candidates = [
    resolve(dirname(fromAbs), `${cleaned}.ts`),
    resolve(dirname(fromAbs), join(cleaned, "index.ts")),
  ];
  for (const candidate of candidates) {
    const rel = relative(ROOT_DIR, candidate).replace(/\\/g, "/");
    if (!rel.startsWith("src/lib/protocol/")) continue;
    if (resolveProtocolFileLayer(rel)) return rel;
    const shimTarget = resolveShimTarget(candidate);
    if (shimTarget && resolveProtocolFileLayer(shimTarget)) return shimTarget;
  }
  return null;
}

export interface ProtocolLayerEdge {
  from: string;
  fromLayer: ProtocolLayer;
  to: string;
  toLayer: ProtocolLayer;
}

export function formatProtocolLayerEdge(edge: ProtocolLayerEdge): string {
  return `${edge.from} (${edge.fromLayer}) -> ${edge.to} (${edge.toLayer})`;
}

export function collectProtocolLayerUpwardEdges(): ProtocolLayerEdge[] {
  const files = listTsFiles(join(ROOT_DIR, "src/lib/protocol"));
  const edges: ProtocolLayerEdge[] = [];

  for (const abs of files) {
    const fromRel = relative(ROOT_DIR, abs).replace(/\\/g, "/");
    const fromLayer = resolveProtocolFileLayer(fromRel);
    if (!fromLayer) continue;

    const text = readFileSync(abs, "utf-8");
    IMPORT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_RE.exec(text)) !== null) {
      const toRel = resolveRelativeImport(abs, match[1]!);
      if (!toRel) continue;
      const toLayer = resolveProtocolFileLayer(toRel);
      if (!toLayer) continue;
      if (PROTOCOL_LAYER_RANK[toLayer] > PROTOCOL_LAYER_RANK[fromLayer]) {
        edges.push({ from: fromRel, fromLayer, to: toRel, toLayer });
      }
    }
  }

  return edges;
}

export function collectProtocolLayerViolationKeys(): string[] {
  return [...new Set(collectProtocolLayerUpwardEdges().map(formatProtocolLayerEdge))].sort();
}
