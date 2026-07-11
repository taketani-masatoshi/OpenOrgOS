import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import YAML from "yaml";
import { validateCapabilityManifestDrift } from "./agent-capability-sync.js";
import { validateAgentDocsGeneratedDrift } from "./agent-docs-sync.js";
import { getInstallRoot } from "./orgos-paths.js";
import { exportCommunityProtocolBundle } from "./protocol/community-export.js";

interface AgentIdSource {
  agents: Record<string, { id: string }>;
  aliases?: Record<string, string>;
}

export function buildGeneratedAgentIdsSource(root = getInstallRoot()): string {
  const registry = YAML.parse(
    readFileSync(join(root, "steward/core/agents/registry.yaml"), "utf-8")
  ) as AgentIdSource;
  const ids = Object.values(registry.agents).map((agent) => agent.id);
  const aliases = registry.aliases ?? {};
  const allIds = [...ids, ...Object.keys(aliases)];
  return [
    "// Generated from steward/core/agents/registry.yaml by scripts/sync-agent-catalog.ts.",
    "// Do not edit by hand.",
    "export const AGENT_IDS = [",
    ...allIds.map((id) => `  ${JSON.stringify(id)},`),
    "] as const;",
    "",
    `export const AGENT_ID_ALIASES = ${JSON.stringify(aliases, null, 2)} as const;`,
    "",
  ].join("\n");
}

function snapshotDirectory(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const path = join(dir, name.name);
      if (name.isDirectory()) visit(path);
      else result[relative(root, path)] = readFileSync(path, "utf-8");
    }
  };
  if (existsSync(root)) visit(root);
  return result;
}

export function validateCommunityExportDeterminism(): string[] {
  const root = mkdtempSync(join(tmpdir(), "orgos-community-export-"));
  try {
    exportCommunityProtocolBundle(root);
    const first = snapshotDirectory(join(root, "publish/protocol"));
    exportCommunityProtocolBundle(root);
    const second = snapshotDirectory(join(root, "publish/protocol"));
    return JSON.stringify(first) === JSON.stringify(second)
      ? []
      : ["community export changes when regenerated with identical inputs"];
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function validateGeneratedArtifacts(root = getInstallRoot()): string[] {
  const issues: string[] = [];
  const generatedIdsPath = join(root, "schemas/generated/agent-ids.ts");
  const expectedIds = buildGeneratedAgentIdsSource(root);
  if (!existsSync(generatedIdsPath) || readFileSync(generatedIdsPath, "utf-8") !== expectedIds) {
    issues.push("schemas/generated/agent-ids.ts is stale");
  }
  issues.push(...validateCapabilityManifestDrift());
  issues.push(...validateAgentDocsGeneratedDrift());
  issues.push(...validateCommunityExportDeterminism());
  return issues;
}
