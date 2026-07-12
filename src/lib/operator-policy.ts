import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { OPERATOR_POLICY_PATH } from "./steward-paths.js";
import { ROOT_DIR } from "./tenant.js";

export const AGENTS_MD_REL = "AGENTS.md";
export const OPERATOR_POLICY_CURSOR_RULE = ".cursor/rules/operator-policy.mdc";
export const TOOL_NEUTRAL_DEV_GUIDE_PATH = join(ROOT_DIR, "steward", "rules", "tool-neutral-development.md");
export const ENGINEERING_CONSTITUTION_PATH = join(
  ROOT_DIR,
  "steward",
  "rules",
  "openorgos-engineering-constitution.md",
);
export const ENGINEERING_RULES_DIR = join(ROOT_DIR, "steward", "rules", "engineering");
export const TOOL_NEUTRAL_DEV_CURSOR_RULE = ".cursor/rules/tool-neutral-development.mdc";
export const DATA_CLASSIFICATION_PATH = join(ROOT_DIR, "steward", "rules", "data-classification.md");
export const DATA_CLASSIFICATION_CURSOR_RULE = ".cursor/rules/data-classification.mdc";
export const STEWARD_OPS_SUMMARY_PATH = join(ROOT_DIR, "steward", "rules", "steward-ops-summary.md");
export const STEWARD_OPS_CURSOR_RULE = ".cursor/rules/steward.mdc";
export const COMPANY_EVENTS_AI_PATH = join(ROOT_DIR, "steward", "rules", "company-events-ai.md");
export const COMPANY_EVENTS_CURSOR_RULE = ".cursor/rules/company-events.mdc";

/** Canonical engineering rule stems (00–09). Mirror: `.cursor/rules/{stem}.mdc` */
export const ENGINEERING_RULE_STEMS = [
  "00-engineering-constitution",
  "01-architecture",
  "02-typescript",
  "03-python",
  "04-testing",
  "05-git",
  "06-documentation",
  "07-security",
  "08-event-sourcing",
  "09-openorgos-domain",
] as const;

export type EngineeringRuleStem = (typeof ENGINEERING_RULE_STEMS)[number];

export interface EngineeringRuleFrontmatter {
  description: string;
  alwaysApply?: boolean;
  globs?: string;
}

export function parseEngineeringRuleFrontmatter(content: string): {
  frontmatter: EngineeringRuleFrontmatter;
  body: string;
} {
  if (!content.startsWith("---\n")) {
    throw new Error("Engineering rule missing YAML frontmatter (expected leading ---)");
  }
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) {
    throw new Error("Engineering rule has unclosed YAML frontmatter");
  }
  const yamlBlock = content.slice(4, end);
  const body = content.slice(end + 5);
  const frontmatter: EngineeringRuleFrontmatter = { description: "" };

  for (const line of yamlBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "description") frontmatter.description = value;
    else if (key === "alwaysApply") frontmatter.alwaysApply = value === "true";
    else if (key === "globs") frontmatter.globs = value;
  }

  if (!frontmatter.description) {
    throw new Error("Engineering rule frontmatter requires description");
  }
  return { frontmatter, body };
}

export function rewriteDataClassificationLinksForCursorMirror(body: string): string {
  return body.replace(/\]\(engineering\//g, "](steward/rules/engineering/");
}

export function buildDataClassificationCursorMdc(): string {
  if (!existsSync(DATA_CLASSIFICATION_PATH)) {
    throw new Error(`Missing data classification policy: ${DATA_CLASSIFICATION_PATH}`);
  }
  const body = rewriteDataClassificationLinksForCursorMirror(
    readFileSync(DATA_CLASSIFICATION_PATH, "utf-8")
  );
  return `---
description: データ機密階層 L0–L3 · Git/AI 境界 · 出力禁止
globs:
  - tenants/**/*
  - docs/**/*
  - steward/**/*
alwaysApply: true
---

${body.trimEnd()}

> **Mirror only.** Canonical: \`steward/rules/data-classification.md\` · Regenerate: \`orgos operator sync-policy --emit all\`
`;
}

export function syncDataClassificationRule(): string {
  const cursorDir = join(ROOT_DIR, ".cursor", "rules");
  mkdirSync(cursorDir, { recursive: true });
  const outPath = join(ROOT_DIR, DATA_CLASSIFICATION_CURSOR_RULE);
  writeFileSync(outPath, buildDataClassificationCursorMdc(), "utf-8");
  return outPath;
}

function buildRuleMdcFromCanonical(
  canonicalPath: string,
  mirrorRel: string,
  linkRewrite: (body: string) => string,
  emitHint: string
): string {
  if (!existsSync(canonicalPath)) {
    throw new Error(`Missing canonical rule: ${canonicalPath}`);
  }
  const content = readFileSync(canonicalPath, "utf-8");
  const { frontmatter, body } = parseEngineeringRuleFrontmatter(content);
  const mirrorBody = linkRewrite(body);
  const lines = [`description: ${frontmatter.description}`];
  if (frontmatter.alwaysApply === true) lines.push("alwaysApply: true");
  if (frontmatter.globs) lines.push(`globs: ${frontmatter.globs}`);
  const canonicalRel = canonicalPath.replace(`${ROOT_DIR}/`, "");
  return `---
${lines.join("\n")}
---

${mirrorBody.trimEnd()}

> **Mirror only.** Canonical: \`${canonicalRel}\` · Regenerate: \`orgos operator sync-policy --emit ${emitHint}\`
`;
}

export function buildStewardOpsCursorMdc(): string {
  return buildRuleMdcFromCanonical(
    STEWARD_OPS_SUMMARY_PATH,
    STEWARD_OPS_CURSOR_RULE,
    (body) =>
      body
        .replace(/\]\(engineering\//g, "](steward/rules/engineering/")
        .replace(/\]\(([a-z0-9_-]+\.md)\)/gi, "](steward/rules/$1)"),
    "all"
  );
}

export function buildCompanyEventsCursorMdc(): string {
  return buildRuleMdcFromCanonical(
    COMPANY_EVENTS_AI_PATH,
    COMPANY_EVENTS_CURSOR_RULE,
    (body) => body.replace(/\]\(([a-z0-9_-]+\.md)\)/gi, "](steward/rules/$1)"),
    "all"
  );
}

export function syncStewardOpsRule(): string {
  const cursorDir = join(ROOT_DIR, ".cursor", "rules");
  mkdirSync(cursorDir, { recursive: true });
  const outPath = join(ROOT_DIR, STEWARD_OPS_CURSOR_RULE);
  writeFileSync(outPath, buildStewardOpsCursorMdc(), "utf-8");
  return outPath;
}

export function syncCompanyEventsRule(): string {
  const cursorDir = join(ROOT_DIR, ".cursor", "rules");
  mkdirSync(cursorDir, { recursive: true });
  const outPath = join(ROOT_DIR, COMPANY_EVENTS_CURSOR_RULE);
  writeFileSync(outPath, buildCompanyEventsCursorMdc(), "utf-8");
  return outPath;
}

export function rewriteEngineeringBodyLinksForCursorMirror(body: string): string {
  return body
    .replace(/\]\(\.\.\/engineering\/([0-9]{2}-[^)]+\.md)\)/g, "](steward/rules/engineering/$1)")
    .replace(/\]\(\.\.\/([a-z0-9_-]+\.md)\)/gi, "](steward/rules/$1)")
    .replace(/\]\(([0-9]{2}-[a-z0-9-]+\.md)\)/g, "](steward/rules/engineering/$1)")
    .replace(/\]\(\.\.\/\.\.\/core\//g, "](steward/core/")
    .replace(/\]\(\.\.\/\.\.\/modules\//g, "](steward/modules/")
    .replace(/\]\(\.\.\/\.\.\/\.\.\/docs\//g, "](docs/");
}

export function engineeringConstitutionExcerpt(maxLines = 55): string {
  const path = join(ENGINEERING_RULES_DIR, "00-engineering-constitution.md");
  const { body } = parseEngineeringRuleFrontmatter(readFileSync(path, "utf-8"));
  return body.split("\n").slice(0, maxLines).join("\n");
}

/** Rewrite relative steward links for portable agent packs (external LLM tools). */
export function rewriteMarkdownLinksForPortableExport(body: string): string {
  return body
    .replace(/\]\(\.\.\/engineering\//g, "](steward/rules/engineering/")
    .replace(
      /\]\(\.\.\/openorgos-engineering-constitution\.md\)/g,
      "](steward/rules/openorgos-engineering-constitution.md)"
    )
    .replace(/\]\(\.\.\/rules\//g, "](steward/rules/")
    .replace(/\]\(\.\.\/steward\//g, "](steward/")
    .replace(/\]\(\.\.\/\.\.\/\.\.\/jurisdiction-packs\//g, "](steward/jurisdiction-packs/")
    .replace(/\]\(\.\.\/\.\.\/jurisdiction-packs\//g, "](steward/jurisdiction-packs/")
    .replace(/\]\(\.\.\/jurisdiction-packs\//g, "](steward/jurisdiction-packs/")
    .replace(/\]\(\.\.\/docs\//g, "](docs/")
    .replace(/\]\(\.\.\/orchestrators\//g, "](steward/orchestrators/")
    .replace(/[ \t]+$/gm, "");
}

export function buildEngineeringRuleMdc(stem: EngineeringRuleStem): string {
  const canonicalPath = join(ENGINEERING_RULES_DIR, `${stem}.md`);
  if (!existsSync(canonicalPath)) {
    throw new Error(`Missing engineering rule: ${canonicalPath}`);
  }
  const content = readFileSync(canonicalPath, "utf-8");
  const { frontmatter, body } = parseEngineeringRuleFrontmatter(content);
  const mirrorBody = rewriteEngineeringBodyLinksForCursorMirror(body);

  const lines = [`description: ${frontmatter.description}`];
  if (frontmatter.alwaysApply === true) lines.push("alwaysApply: true");
  if (frontmatter.globs) lines.push(`globs: ${frontmatter.globs}`);

  return `---
${lines.join("\n")}
---

${mirrorBody.trimEnd()}

> **Mirror only.** Canonical: \`steward/rules/engineering/${stem}.md\` · Regenerate: \`orgos operator sync-policy --emit engineering\`
`;
}

export function listEngineeringRuleStemsOnDisk(): string[] {
  if (!existsSync(ENGINEERING_RULES_DIR)) return [];
  return readdirSync(ENGINEERING_RULES_DIR)
    .filter((f) => f.endsWith(".md") && f !== "00-このフォルダについて.md")
    .map((f) => basename(f, ".md"))
    .sort();
}

export function assertEngineeringRulesComplete(): void {
  const onDisk = listEngineeringRuleStemsOnDisk();
  const missing = ENGINEERING_RULE_STEMS.filter((s) => !onDisk.includes(s));
  if (missing.length > 0) {
    throw new Error(`Missing engineering rule files: ${missing.join(", ")}`);
  }
  const extra = onDisk.filter((s) => !ENGINEERING_RULE_STEMS.includes(s as EngineeringRuleStem));
  if (extra.length > 0) {
    throw new Error(`Unexpected engineering rule files: ${extra.join(", ")}`);
  }
}

export function syncEngineeringRules(): string[] {
  assertEngineeringRulesComplete();
  const cursorDir = join(ROOT_DIR, ".cursor", "rules");
  mkdirSync(cursorDir, { recursive: true });
  const paths: string[] = [];
  for (const stem of ENGINEERING_RULE_STEMS) {
    const outPath = join(cursorDir, `${stem}.mdc`);
    writeFileSync(outPath, buildEngineeringRuleMdc(stem), "utf-8");
    paths.push(outPath);
  }
  return paths;
}

export function validatePolicyMirrors(): string[] {
  const issues: string[] = [];

  try {
    assertEngineeringRulesComplete();
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  for (const stem of ENGINEERING_RULE_STEMS) {
    const rel = `.cursor/rules/${stem}.mdc`;
    const mirrorPath = join(ROOT_DIR, rel);
    const expected = buildEngineeringRuleMdc(stem);
    if (!existsSync(mirrorPath)) {
      issues.push(`${rel} missing; run orgos operator sync-policy --emit engineering`);
      continue;
    }
    if (readFileSync(mirrorPath, "utf-8") !== expected) {
      issues.push(`${rel} stale; run orgos operator sync-policy --emit engineering`);
    }
  }

  const policyMirrors = [
    [OPERATOR_POLICY_CURSOR_RULE, buildCursorOperatorPolicyMdc(), "cursor"],
    [TOOL_NEUTRAL_DEV_CURSOR_RULE, buildToolNeutralDevCursorMdc(), "dev-guide"],
    [DATA_CLASSIFICATION_CURSOR_RULE, buildDataClassificationCursorMdc(), "all"],
    [STEWARD_OPS_CURSOR_RULE, buildStewardOpsCursorMdc(), "all"],
    [COMPANY_EVENTS_CURSOR_RULE, buildCompanyEventsCursorMdc(), "all"],
    [AGENTS_MD_REL, buildAgentsMd(), "all"],
  ] as const;

  for (const [rel, expected, emit] of policyMirrors) {
    const mirrorPath = join(ROOT_DIR, rel);
    if (!existsSync(mirrorPath)) {
      issues.push(`${rel} missing; run orgos operator sync-policy --emit ${emit}`);
      continue;
    }
    if (readFileSync(mirrorPath, "utf-8") !== expected) {
      issues.push(`${rel} stale; run orgos operator sync-policy --emit ${emit}`);
    }
  }

  return issues;
}

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

## Engineering Constitution

分割正本: [steward/rules/engineering/](steward/rules/engineering/00-このフォルダについて.md) · 索引: [openorgos-engineering-constitution.md](steward/rules/openorgos-engineering-constitution.md)

| ファイル | 内容 |
|---------|------|
| \`00-engineering-constitution\` | Purpose · AI Rules · DoD |
| \`01-architecture\` | SSOT · layers · CLI path |
| \`08-event-sourcing\` | Event First · immutable · deterministic |
| \`09-openorgos-domain\` | 4-layer · Wire · catalog/roster |

AI 実装提案時は **§10 AI Coding Rules**（\`00-engineering-constitution\`）に従う。Definition of Done: テスト · lint · ドキュメント · 重複/デッドコードなし。

## Quick commands

\`\`\`bash
orgos chat today
orgos validate
orgos dashboard
orgos operator export --agent finance
orgos operator sync-policy --emit engineering
\`\`\`

Canonical: \`steward/rules/operator-policy.md\`
`;
}

export type OperatorPolicyEmit =
  | "cursor"
  | "agents-md"
  | "dev-guide"
  | "engineering"
  | "data-classification"
  | "all";

export function syncOperatorPolicy(emit: OperatorPolicyEmit = "all"): {
  cursorRulePath?: string;
  agentsMdPath?: string;
  devGuideRulePath?: string;
  dataClassificationRulePath?: string;
  stewardOpsRulePath?: string;
  companyEventsRulePath?: string;
  engineeringRulePaths?: string[];
} {
  const result: {
    cursorRulePath?: string;
    agentsMdPath?: string;
    devGuideRulePath?: string;
    dataClassificationRulePath?: string;
    stewardOpsRulePath?: string;
    companyEventsRulePath?: string;
    engineeringRulePaths?: string[];
  } = {};

  const cursorDir = join(ROOT_DIR, ".cursor", "rules");

  if (emit === "cursor" || emit === "all") {
    mkdirSync(cursorDir, { recursive: true });
    const cursorRulePath = join(ROOT_DIR, OPERATOR_POLICY_CURSOR_RULE);
    writeFileSync(cursorRulePath, buildCursorOperatorPolicyMdc(), "utf-8");
    result.cursorRulePath = cursorRulePath;
  }

  if (emit === "data-classification" || emit === "all") {
    result.dataClassificationRulePath = syncDataClassificationRule();
  }

  if (emit === "all") {
    result.stewardOpsRulePath = syncStewardOpsRule();
    result.companyEventsRulePath = syncCompanyEventsRule();
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

  if (emit === "engineering" || emit === "all") {
    result.engineeringRulePaths = syncEngineeringRules();
  }

  return result;
}

export function operatorPolicyExcerpt(maxLines = 40): string {
  const lines = loadOperatorPolicyMarkdown().split("\n");
  return lines.slice(0, maxLines).join("\n");
}
