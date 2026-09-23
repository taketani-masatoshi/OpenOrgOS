/**
 * Public facade for agent portability / portable export.
 * Implementation lives under src/lib/agents/portability/.
 * writeFileSync for exports stays here (canonical-write-baseline).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import { isAgentActive } from "./agent-catalog.js";
import {
  AGENT_EXPORTS_DIR,
  loadAgentRegistryEntries,
  type AgentRegistryEntry,
} from "./agents/portability/prompt-ref.js";
import { buildPortableAgentPack, buildPortableIndex } from "./agents/portability/pack-export.js";
import {
  buildClaudeDesktopMcpSnippet,
  buildContinueMcpSnippet,
} from "./agents/portability/mcp-snippets.js";

export {
  AGENT_EXPORTS_DIR,
  type AgentToolFormat,
  type AgentRegistryEntry,
  loadAgentRegistryEntries,
  agentPromptPath,
  formatAgentPromptRef,
  formatSkillReference,
  isAgentInteractiveSkill,
  readAgentDefinition,
} from "./agents/portability/prompt-ref.js";

export {
  buildPortableAgentPack,
  buildPortableIndex,
  validateAgentPackExports,
} from "./agents/portability/pack-export.js";

export {
  buildClaudeDesktopMcpSnippet,
  buildContinueMcpSnippet,
} from "./agents/portability/mcp-snippets.js";

export type {
  PortabilityScoreBreakdown,
  PortabilityAssessment,
} from "./agents/portability/assessment.js";
export {
  computePortabilityAssessment,
  formatPortabilityAssessment,
} from "./agents/portability/assessment.js";

export type OperatorExportEmit = "packs" | "index" | "mcp" | "all";

export interface OperatorExportResult {
  packs: string[];
  changedPacks: string[];
  indexPath?: string;
  mcpPaths: string[];
}

function writeGeneratedFileIfChanged(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf-8") === content) return false;
  writeFileSync(path, content, "utf-8");
  return true;
}

export function exportPortableAgents(opts: {
  agent?: string;
  all?: boolean;
  emit?: OperatorExportEmit;
  fullPolicy?: boolean;
}): OperatorExportResult {
  const emit = opts.emit ?? "all";
  const agentsDir = join(AGENT_EXPORTS_DIR, "agents");
  const mcpDir = join(AGENT_EXPORTS_DIR, "mcp");
  mkdirSync(agentsDir, { recursive: true });
  if (emit === "mcp" || emit === "all") mkdirSync(mcpDir, { recursive: true });

  const registry = loadAgentRegistryEntries();
  let targets: AgentRegistryEntry[];
  if (opts.all) {
    targets = registry.filter((entry) =>
      isAgentActive(entry.id as AgentId, {
        profile: "operational",
        mode: "consult",
      })
    );
  } else if (opts.agent) {
    const found = registry.find((a) => a.id === opts.agent);
    if (!found) throw new Error(`Unknown agent: ${opts.agent}`);
    targets = [found];
  } else {
    targets = registry.filter((a) => a.tier === "core");
  }

  const result: OperatorExportResult = { packs: [], changedPacks: [], mcpPaths: [] };

  if (emit === "packs" || emit === "all") {
    for (const entry of targets) {
      const packPath = join(agentsDir, `${entry.id}.pack.md`);
      const changed = writeGeneratedFileIfChanged(
        packPath,
        buildPortableAgentPack(entry.id as AgentId, { fullPolicy: opts.fullPolicy })
      );
      result.packs.push(packPath);
      if (changed) result.changedPacks.push(packPath);
    }
  }

  if (emit === "index" || emit === "all") {
    const indexPath = join(AGENT_EXPORTS_DIR, "INDEX.md");
    writeGeneratedFileIfChanged(indexPath, buildPortableIndex());
    result.indexPath = indexPath;
  }

  if (emit === "mcp" || emit === "all") {
    const claudePath = join(mcpDir, "claude-desktop.snippet.json");
    const continuePath = join(mcpDir, "continue.snippet.json");
    writeGeneratedFileIfChanged(claudePath, buildClaudeDesktopMcpSnippet());
    writeGeneratedFileIfChanged(continuePath, buildContinueMcpSnippet());
    result.mcpPaths.push(claudePath, continuePath);
  }

  const readmePath = join(AGENT_EXPORTS_DIR, "README.md");
  writeGeneratedFileIfChanged(
    readmePath,
    [
      "# Agent exports（自動生成）",
      "",
      "このフォルダは **ツール非依存** の Agent パックと MCP 設定 snippet です。",
      "",
      "```bash",
      "orgos operator export --all          # 全 Agent",
      "orgos operator export --agent finance  # 1 Agent",
      "orgos operator export --emit mcp       # MCP snippet のみ",
      "```",
      "",
      "正本 Agent 定義: `steward/core/agents/`",
      "",
    ].join("\n")
  );

  return result;
}
