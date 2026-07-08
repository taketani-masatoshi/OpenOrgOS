import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OPERATOR_POLICY_PATH } from "./steward-paths.js";
import { ROOT_DIR } from "./tenant.js";

export const AGENTS_MD_REL = "AGENTS.md";
export const OPERATOR_POLICY_CURSOR_RULE = ".cursor/rules/operator-policy.mdc";
export const TOOL_NEUTRAL_DEV_GUIDE_PATH = join(ROOT_DIR, "steward", "rules", "tool-neutral-development.md");
export const TOOL_NEUTRAL_DEV_CURSOR_RULE = ".cursor/rules/tool-neutral-development.mdc";

export function loadToolNeutralDevGuideMarkdown(): string {
  if (!existsSync(TOOL_NEUTRAL_DEV_GUIDE_PATH)) {
    throw new Error(`Missing dev guide: ${TOOL_NEUTRAL_DEV_GUIDE_PATH}`);
  }
  return readFileSync(TOOL_NEUTRAL_DEV_GUIDE_PATH, "utf-8");
}

export function loadOperatorPolicyMarkdown(): string {
  if (!existsSync(OPERATOR_POLICY_PATH)) {
    throw new Error(`Missing operator policy: ${OPERATOR_POLICY_PATH}`);
  }
  return readFileSync(OPERATOR_POLICY_PATH, "utf-8");
}

export function buildCursorOperatorPolicyMdc(): string {
  const body = loadOperatorPolicyMarkdown();
  return `---
description: OrgOS Operator Policy — tool-neutral LLM rules (canonical mirror)
alwaysApply: true
---

${body}

> **Mirror only.** Canonical: \`steward/rules/operator-policy.md\` · Regenerate: \`orgos operator sync-policy --emit cursor\`
`;
}

export function buildToolNeutralDevCursorMdc(): string {
  const body = loadToolNeutralDevGuideMarkdown();
  return `---
description: OrgOS tool-neutral development — do not assume Cursor (canonical mirror)
alwaysApply: true
---

${body}

> **Mirror only.** Canonical: \`steward/rules/tool-neutral-development.md\` · Regenerate: \`orgos operator sync-policy --emit all\`
`;
}

export function buildAgentsMd(): string {
  const body = loadOperatorPolicyMarkdown();
  return `# AGENTS.md — OrgOS Operator

${body}

## Multi-tool portability

Agent 定義は **Markdown（ツール非依存）**。Cursor 以外でも利用できます。

| ツール | 使い方 |
|--------|--------|
| **Claude / ChatGPT** | \`orgos operator export --agent <id>\` の pack を system / project に貼付 |
| **Aider / Cline** | \`ORGOS_SHELL_PROFILE=aider\` · Work Order プロンプト MD |
| **Continue / Claude Desktop** | \`orgos mcp start\` — snippet: \`steward/platform/agent/exports/mcp/\` |
| **Steward Chat** | OpenAI 互換 API · \`orgos chat ask\` |
| **Cursor** | \`@steward/core/agents/*_agent.md\` · \`.cursor/rules/operator-policy.mdc\` |

\`\`\`bash
orgos operator export --all
orgos operator sync-policy --emit all
\`\`\`

正本 Agent: \`steward/core/agents/\` · Export index: \`steward/platform/agent/exports/INDEX.md\`

## Development guide（Cursor 非依存）

**今後の開発は Cursor を前提にしない。** 正本: [steward/rules/tool-neutral-development.md](steward/rules/tool-neutral-development.md)

- 正本は \`steward/rules/\` · \`src/\` · テスト — \`.cursor/\` はミラーのみ
- 新 Skill は \`runtime: cli\` 優先 · \`cursor-only\` 新規禁止
- Agent 参照は **Path 第一** · 変更後 \`orgos operator export\`

## Quick commands

\`\`\`bash
orgos chat today
orgos validate
orgos dashboard
orgos operator export --agent finance
\`\`\`

Canonical: \`steward/rules/operator-policy.md\`
`;
}

export type OperatorPolicyEmit = "cursor" | "agents-md" | "dev-guide" | "all";

export function syncOperatorPolicy(emit: OperatorPolicyEmit = "all"): {
  cursorRulePath?: string;
  agentsMdPath?: string;
  devGuideRulePath?: string;
} {
  const result: {
    cursorRulePath?: string;
    agentsMdPath?: string;
    devGuideRulePath?: string;
  } = {};

  const cursorDir = join(ROOT_DIR, ".cursor", "rules");

  if (emit === "cursor" || emit === "all") {
    mkdirSync(cursorDir, { recursive: true });
    const cursorRulePath = join(ROOT_DIR, OPERATOR_POLICY_CURSOR_RULE);
    writeFileSync(cursorRulePath, buildCursorOperatorPolicyMdc(), "utf-8");
    result.cursorRulePath = cursorRulePath;
  }

  if (emit === "agents-md" || emit === "all") {
    const agentsMdPath = join(ROOT_DIR, AGENTS_MD_REL);
    writeFileSync(agentsMdPath, buildAgentsMd(), "utf-8");
    result.agentsMdPath = agentsMdPath;
  }

  if (emit === "dev-guide" || emit === "all") {
    mkdirSync(cursorDir, { recursive: true });
    const devGuideRulePath = join(ROOT_DIR, TOOL_NEUTRAL_DEV_CURSOR_RULE);
    writeFileSync(devGuideRulePath, buildToolNeutralDevCursorMdc(), "utf-8");
    result.devGuideRulePath = devGuideRulePath;
  }

  return result;
}

export function operatorPolicyExcerpt(maxLines = 40): string {
  const lines = loadOperatorPolicyMarkdown().split("\n");
  return lines.slice(0, maxLines).join("\n");
}
