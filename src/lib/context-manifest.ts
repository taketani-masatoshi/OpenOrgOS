import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tenantStandardsFileSchema } from "../../schemas/tenant-standards.js";
import {
  listCatalogModuleIds,
  loadEnabledModules,
  loadModulesFile,
} from "./modules.js";
import { listIsoStandardIds } from "./standards.js";
import { getTenantDir, getTenantId, ROOT_DIR } from "./tenant.js";
import { readYamlFile } from "./utils.js";

export const STANDARDS_FILE = "standards.yaml";
export const ACTIVE_CONTEXT_REL = "rules/active_context.md";
export const CURSOR_ACTIVE_RULE = ".cursor/rules/tenant-active-context.mdc";

export function standardsFilePath(): string {
  return join(getTenantDir(), STANDARDS_FILE);
}

export function loadTenantStandards() {
  const path = standardsFilePath();
  if (!existsSync(path)) {
    return { iso: [] as { id: string; enabled: boolean; notes?: string }[] };
  }
  return readYamlFile(path, tenantStandardsFileSchema);
}

export function loadEnabledIsoIds(): string[] {
  const file = loadTenantStandards();
  const enabled = new Set(
    file.iso.filter((e) => e.enabled).map((e) => e.id)
  );
  if (enabled.size === 0) return [];
  return listIsoStandardIds().filter((id) => enabled.has(id));
}

export function buildActiveContextMarkdown(): string {
  const tenantId = getTenantId();
  const enabledModules = loadEnabledModules();
  const allModules = loadModulesFile().modules;
  const disabledModules = allModules.filter((m) => !m.enabled);
  const enabledIso = loadEnabledIsoIds();
  const allIso = listIsoStandardIds();
  const disabledIso = allIso.filter((id) => !enabledIso.includes(id));

  const lines: string[] = [
    `# アクティブコンテキスト — テナント \`${tenantId}\``,
    "",
    "**正本:** `modules.yaml` · `standards.yaml` · **生成:** `npm run steward -- modules sync-context`",
    "",
    "> **トークン節約:** 本ファイルに列挙されたパスのみ Agent が読む。無効モジュール · 無効 ISO · カタログ seed は **@file 明示時以外読まない。**",
    "",
    "---",
    "",
    "## 有効業務モジュール",
    "",
  ];

  if (enabledModules.length === 0) {
    lines.push("（なし）");
  } else {
    for (const mod of enabledModules) {
      lines.push(`### \`${mod.id}\` (\`${mod.agent}\`)`);
      lines.push("");
      lines.push(`- Agent: \`steward/modules/${mod.agent}/agent.md\``);
      if (mod.property_ids?.length) {
        lines.push(`- 物件: ${mod.property_ids.map((p) => `\`${p}\``).join(", ")}`);
      }
      if (mod.data_root) lines.push(`- data: \`${mod.data_root}\``);
      if (mod.docs_root) lines.push(`- docs: \`${mod.docs_root}\``);
      if (mod.summary_dir) {
        lines.push(`- 要約: \`docs/reports/${mod.summary_dir}\``);
      }
      lines.push("");
    }
  }

  lines.push("## 無効業務モジュール（読取禁止）", "");
  if (disabledModules.length === 0) {
    lines.push("（なし）");
  } else {
    for (const mod of disabledModules) {
      lines.push(
        `- \`${mod.id}\` / \`${mod.agent}\` — \`steward/modules/${mod.agent}/\` **読まない**`
      );
    }
  }

  lines.push("", "## 有効 ISO 標準", "");
  if (enabledIso.length === 0) {
    lines.push("（なし — `standards.yaml` で有効化）");
  } else {
    for (const id of enabledIso) {
      lines.push(
        `- **${id}** — テンプレ: \`steward/standards/iso/${id}/\` · 記録: \`docs/compliance/iso/${id}/\``
      );
    }
  }

  lines.push("", "## 無効 ISO 標準（読取禁止）", "");
  for (const id of disabledIso) {
    lines.push(`- \`${id}\` — \`steward/standards/iso/${id}/\` **読まない**`);
  }

  const catalogOnly = listCatalogModuleIds().filter(
    (id) => !allModules.some((m) => m.agent === id)
  );
  if (catalogOnly.length) {
    lines.push("", "## 未バインドカタログ（読取禁止）", "");
    for (const id of catalogOnly) {
      lines.push(`- \`${id}\` — \`modules.yaml\` 未登録 · **読まない**`);
    }
  }

  lines.push(
    "",
    "## Steward / Executive",
    "",
    "- コア Agent のみ常時: `steward/agents/`",
    "- 要約: 有効モジュールの `summary_dir` のみ",
    "- カタログ索引: `steward/modules/00-このフォルダについて.md`（一覧のみ）",
    ""
  );

  return lines.join("\n");
}

export function buildCursorActiveRuleMdc(): string {
  const tenantId = getTenantId();
  const enabledModules = loadEnabledModules();
  const enabledIso = loadEnabledIsoIds();

  const moduleRefs = enabledModules
    .map(
      (m) =>
        `- **${m.id}:** \`steward/modules/${m.agent}/agent.md\`（Skill は必要時のみ同 \`skills/\`）`
    )
    .join("\n");

  const isoRefs = enabledIso
    .map(
      (id) =>
        `- **${id}:** テンプレ \`steward/standards/iso/${id}/00-このフォルダについて.md\` · 記録 \`docs/compliance/iso/${id}/\``
    )
    .join("\n");

  return `---
description: Active tenant modules and ISO — load only these paths (token saving)
alwaysApply: true
---

# テナント \`${tenantId}\` — アクティブコンテキストのみ読取

**生成:** \`npm run steward -- modules sync-context\` · 正本: \`tenants/${tenantId}/rules/active_context.md\`

## 禁止（トークン節約）

- \`steward/modules/{id}/\` のうち **下表にない id** の agent.md · skills · seed
- \`steward/standards/iso/ISO-*\` のうち **下表にない規格**
- 無効 \`modules.yaml\` エントリの \`data_root\` · \`docs_root\`
- \`@folder\` で \`steward/modules/\` 全体を指定しない

## 有効業務モジュール

${moduleRefs || "（なし）"}

## 有効 ISO

${isoRefs || "（なし — standards.yaml で有効化）"}

## コア Agent（常時）

Executive · Secretary · Finance · Contract · Compliance · Operations — \`steward/agents/\`

業務モジュール作業時のみ、上記 **有効業務モジュール** の agent.md を @ 参照する。
`;
}

export function syncActiveContext(): { contextPath: string; cursorRulePath: string } {
  const tenantDir = getTenantDir();
  const rulesDir = join(tenantDir, "rules");
  if (!existsSync(rulesDir)) mkdirSync(rulesDir, { recursive: true });

  const contextPath = join(tenantDir, ACTIVE_CONTEXT_REL);
  const cursorRulePath = join(ROOT_DIR, CURSOR_ACTIVE_RULE);

  writeFileSync(contextPath, buildActiveContextMarkdown(), "utf-8");
  writeFileSync(cursorRulePath, buildCursorActiveRuleMdc(), "utf-8");

  return { contextPath, cursorRulePath };
}
