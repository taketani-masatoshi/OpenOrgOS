import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OPERATOR_POLICY_PATH } from "./steward-paths.js";
import { ROOT_DIR } from "./tenant.js";

export const AGENTS_MD_REL = "AGENTS.md";
export const OPERATOR_POLICY_CURSOR_RULE = ".cursor/rules/operator-policy.mdc";

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

export function buildAgentsMd(): string {
  const body = loadOperatorPolicyMarkdown();
  return `# AGENTS.md — OrgOS Operator

${body}

## Quick commands

\`\`\`bash
orgos chat today
orgos validate
orgos dashboard
\`\`\`

Canonical: \`steward/rules/operator-policy.md\`
`;
}

export type OperatorPolicyEmit = "cursor" | "agents-md" | "all";

export function syncOperatorPolicy(emit: OperatorPolicyEmit = "all"): {
  cursorRulePath?: string;
  agentsMdPath?: string;
} {
  const result: { cursorRulePath?: string; agentsMdPath?: string } = {};

  if (emit === "cursor" || emit === "all") {
    const cursorDir = join(ROOT_DIR, ".cursor", "rules");
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

  return result;
}

export function operatorPolicyExcerpt(maxLines = 40): string {
  const lines = loadOperatorPolicyMarkdown().split("\n");
  return lines.slice(0, maxLines).join("\n");
}
