import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  listCatalogModuleIds,
  loadEnabledModules,
  loadModulesFile,
} from "./modules.js";
import { listEffectiveRegulations } from "./regulations.js";
import { loadEnabledIsoIds } from "./tenant-standards.js";
import { listIsoStandardIds } from "./standards.js";
import { getTenantDir, getTenantId, ROOT_DIR } from "./tenant.js";

export { loadEnabledIsoIds } from "./tenant-standards.js";

export const STANDARDS_FILE = "standards.yaml";
export const REGULATIONS_FILE = "regulations.yaml";
export const ACTIVE_CONTEXT_REL = "rules/active_context.md";
export const CURSOR_ACTIVE_RULE = ".cursor/rules/tenant-active-context.mdc";

export function buildActiveContextMarkdown(): string {
  const tenantId = getTenantId();
  const enabledModules = loadEnabledModules();
  const allModules = loadModulesFile().modules;
  const disabledModules = allModules.filter((m) => !m.enabled);
  const enabledIso = loadEnabledIsoIds();
  const allIso = listIsoStandardIds();
  const disabledIso = allIso.filter((id) => !enabledIso.includes(id));
  const effectiveRegs = listEffectiveRegulations().filter((r) => r.effective);
  const inactiveRegs = listEffectiveRegulations().filter((r) => !r.effective);

  const lines: string[] = [
    `# アクティブコンテキスト — テナント \`${tenantId}\``,
    "",
    "**正本:** `modules.yaml` · `standards.yaml` · `regulations.yaml` · **生成:** `npm run steward -- modules sync-context`",
    "",
    "> **トークン節約:** 本ファイルに列挙されたパスのみ Agent が読む。無効モジュール · 無効 ISO · 無効規程 · カタログ seed/テンプレは **@file 明示時以外読まない。**",
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

  lines.push("", "## 有効社内規程", "");
  if (effectiveRegs.length === 0) {
    lines.push("（なし — `regulations.yaml` で有効化）");
  } else {
    for (const reg of effectiveRegs) {
      lines.push(
        `- **${reg.id}** ${reg.name} — 施行: \`${reg.tenantDocPath}\` · テンプレ: \`${reg.templatePath}\``
      );
    }
  }

  lines.push("", "## 無効社内規程（読取禁止）", "");
  if (inactiveRegs.length === 0) {
    lines.push("（なし）");
  } else {
    for (const reg of inactiveRegs) {
      const reason = reg.blockReason ?? (reg.tenantEnabled ? "—" : "regulations.yaml で無効");
      lines.push(
        `- \`${reg.id}\` ${reg.name} — \`${reg.tenantDocPath}\` · テンプレ **読まない**（${reason}）`
      );
    }
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
    "- 規程索引のみ: `docs/company/regulations/00-このフォルダについて.md`（本文は有効 REG のみ）",
    "- 要約: 有効モジュールの `summary_dir` のみ",
    "- カタログ: `steward/modules/00-このフォルダについて.md` · `steward/standards/regulations/00-このフォルダについて.md`",
    ""
  );

  return lines.join("\n");
}

export function buildCursorActiveRuleMdc(): string {
  const tenantId = getTenantId();
  const enabledModules = loadEnabledModules();
  const enabledIso = loadEnabledIsoIds();
  const effectiveRegs = listEffectiveRegulations().filter((r) => r.effective);

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

  const regRefs = effectiveRegs
    .map(
      (r) =>
        `- **${r.id}** ${r.name}: 施行 \`${r.tenantDocPath}\`（テンプレ \`${r.templatePath}\` は改定時のみ）`
    )
    .join("\n");

  return `---
description: Active tenant modules, ISO, and regulations — token saving
alwaysApply: true
---

# テナント \`${tenantId}\` — アクティブコンテキストのみ読取

**生成:** \`npm run steward -- modules sync-context\` · 正本: \`tenants/${tenantId}/rules/active_context.md\`

## 禁止（トークン節約）

- \`steward/modules/{id}/\` のうち **下表にない id** の agent.md · skills · seed
- \`steward/standards/iso/ISO-*\` のうち **下表にない規格**
- \`steward/standards/regulations/**/template.md\` のうち **下表にない REG**
- \`docs/company/regulations/*.md\` のうち **下表にない REG** 施行文
- 無効 \`modules.yaml\` エントリの \`data_root\` · \`docs_root\`
- \`@folder\` で \`steward/modules/\` · \`regulations/\` 全体を指定しない

## 有効業務モジュール

${moduleRefs || "（なし）"}

## 有効 ISO

${isoRefs || "（なし — standards.yaml で有効化）"}

## 有効社内規程

${regRefs || "（なし — regulations.yaml で有効化）"}

## コア Agent（常時）

Executive · Secretary · Finance · Contract · Compliance · Operations — \`steward/agents/\`

業務モジュール · 規程作業時のみ、上記 **有効** の agent.md / 施行文を @ 参照する。
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
