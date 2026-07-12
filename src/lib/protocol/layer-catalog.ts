/**
 * Normative Core / Transport / Distribution / Adapter layer catalog.
 * Physical modules may still re-export compatibility barrels during staged migration.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT_DIR } from "../tenant.js";

export type ProtocolLayer = "core" | "transport" | "distribution" | "adapters";

export interface ProtocolLayerModule {
  layer: ProtocolLayer;
  path: string;
  role: string;
}

export const PROTOCOL_LAYER_MODULES: readonly ProtocolLayerModule[] = [
  { layer: "core", path: "src/lib/protocol/core/index.ts", role: "event · identity · audit" },
  { layer: "transport", path: "src/lib/protocol/transport/index.ts", role: "wire delivery facade" },
  {
    layer: "transport",
    path: "src/lib/protocol/transport/types.ts",
    role: "delivery result types",
  },
  {
    layer: "transport",
    path: "src/lib/protocol/transport/dns.ts",
    role: "peer endpoint DNS resolution",
  },
  {
    layer: "transport",
    path: "src/lib/protocol/transport/inbound.ts",
    role: "inbound mirror · pull",
  },
  { layer: "transport", path: "src/lib/protocol/transport/relay.ts", role: "relay inbox flush" },
  {
    layer: "distribution",
    path: "src/lib/protocol/distribution/index.ts",
    role: "witness · hub · relay worker",
  },
  {
    layer: "adapters",
    path: "src/lib/protocol/adapters/index.ts",
    role: "email_wire · webhook bridge",
  },
  {
    layer: "adapters",
    path: "src/lib/wire/gov-gateway/deliver.ts",
    role: "gov gateway adapter (optional)",
  },
] as const;

export function validateProtocolLayerCatalog(): string[] {
  const issues: string[] = [];
  for (const entry of PROTOCOL_LAYER_MODULES) {
    const abs = join(ROOT_DIR, entry.path);
    if (!existsSync(abs)) {
      issues.push(`missing ${entry.layer} module: ${entry.path}`);
    }
  }

  const transportIndex = join(ROOT_DIR, "src/lib/protocol/transport/index.ts");
  if (existsSync(transportIndex)) {
    const text = readFileSync(transportIndex, "utf-8");
    if (!text.includes("./types.js") || !text.includes("./dns.js")) {
      issues.push("transport/index.ts must export staged transport submodules");
    }
  }

  return issues;
}
