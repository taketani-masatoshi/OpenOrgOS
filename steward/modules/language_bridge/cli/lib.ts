import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DisplayLanguageCode } from "../../../../schemas/locale.js";
import {
  languageBridgeConfigSchema,
  type BilingualLayout,
  type DocumentTypePolicy,
  type LanguageBridgeConfig,
  type RecordLanguageStrategy,
} from "../../../../schemas/language-bridge.js";
import { getResolvedJurisdiction } from "../../../../src/lib/jurisdiction.js";
import { getDisplayLanguageEntry, getResolvedDisplayLocale } from "../../../../src/lib/locale.js";
import { getModuleSeedDir, loadEnabledModules } from "../../../../src/lib/modules.js";
import { readYamlFile, resolveTenantPath } from "../../../../src/lib/utils.js";

export const MODULE_ID = "language_bridge";
export const CONFIG_REL = "data/locale/language-bridge.yaml";
export const CONFIG_EXAMPLE_REL = "data/locale/language-bridge.yaml.example";
export const MINUTES_DIR_REL = "docs/company/minutes";

const DEFAULT_DOC_POLICIES: Record<string, DocumentTypePolicy> = {
  board_minutes: { primary: "system", secondary: "user" },
  shareholder_minutes: { primary: "system", secondary: "none" },
  executive_summary: { primary: "user", secondary: "none" },
  regulation_draft: { primary: "system", secondary: "user" },
};

export interface ResolvedLanguageBridge {
  config: LanguageBridgeConfig;
  configPath: string | null;
  userLanguage: DisplayLanguageCode;
  systemLanguage: DisplayLanguageCode;
  bridged: boolean;
  userLabel: string;
  systemLabel: string;
  layout: BilingualLayout;
  recordStrategy: RecordLanguageStrategy;
}

export function languageBridgeConfigPath(): string {
  return resolveTenantPath(CONFIG_REL);
}

export function languageBridgeExamplePath(): string {
  return resolveTenantPath(CONFIG_EXAMPLE_REL);
}

function isLanguageBridgeEnabled(): boolean {
  return loadEnabledModules().some((m) => m.agent === MODULE_ID);
}

export function loadLanguageBridgeConfig(): LanguageBridgeConfig | null {
  for (const path of [languageBridgeConfigPath(), languageBridgeExamplePath()]) {
    if (existsSync(path)) return readYamlFile(path, languageBridgeConfigSchema);
  }
  // The module seed is a template to copy, not configuration: a tenant that
  // never filled it in keeps its own language rather than the sample's.
  return null;
}

function jurisdictionDefaultSystemLanguage(): DisplayLanguageCode {
  const j = getResolvedJurisdiction();
  if (j.pack.default_display_language) return j.pack.default_display_language;
  return j.display.code;
}

export function resolveUserLanguage(config: LanguageBridgeConfig | null): DisplayLanguageCode {
  if (config?.user_language) return config.user_language;
  return getResolvedDisplayLocale().code;
}

export function resolveSystemLanguage(config: LanguageBridgeConfig | null): DisplayLanguageCode {
  const strategy = config?.record_strategy ?? "explicit";

  if (strategy === "same_as_user") {
    return resolveUserLanguage(config);
  }

  if (strategy === "jurisdiction_default") {
    return jurisdictionDefaultSystemLanguage();
  }

  if (config?.system_language) {
    return config.system_language;
  }

  return resolveUserLanguage(config);
}

export function resolveLanguageBridge(): ResolvedLanguageBridge {
  const config = loadLanguageBridgeConfig();
  const configPath = [languageBridgeConfigPath(), languageBridgeExamplePath()]
    .find((p) => existsSync(p)) ?? null;

  const userLanguage = resolveUserLanguage(config);
  const systemLanguage = resolveSystemLanguage(config);
  const userEntry = getDisplayLanguageEntry(userLanguage);
  const systemEntry = getDisplayLanguageEntry(systemLanguage);

  return {
    config: config ?? languageBridgeConfigSchema.parse({ record_strategy: "same_as_user" }),
    configPath,
    userLanguage,
    systemLanguage,
    bridged: userLanguage !== systemLanguage,
    userLabel: userEntry.label.en,
    systemLabel: systemEntry.label.en,
    layout: config?.layout ?? "system_primary",
    recordStrategy: config?.record_strategy ?? "same_as_user",
  };
}

export function getDocumentTypePolicy(docType: string): DocumentTypePolicy {
  const config = loadLanguageBridgeConfig();
  return config?.document_types?.[docType] ?? DEFAULT_DOC_POLICIES[docType] ?? { primary: "system", secondary: "user" };
}

export function validateLanguageBridge(): string[] {
  if (!isLanguageBridgeEnabled()) {
    return ["language_bridge モジュールが tenant modules.yaml で未有効"];
  }

  const issues: string[] = [];
  const resolved = resolveLanguageBridge();

  if (!existsSync(languageBridgeConfigPath())) {
    issues.push("data/locale/language-bridge.yaml 未作成 — example または seed からコピー");
  }

  if (resolved.recordStrategy === "explicit" && resolved.bridged && !resolved.config.system_language) {
    issues.push("record_strategy=explicit かつ user≠system なのに system_language 未設定");
  }

  if (resolved.bridged && resolved.layout === "bilingual") {
    const seedTemplate = join(getModuleSeedDir(MODULE_ID), "minutes-bilingual-template.md.example");
    if (!existsSync(seedTemplate)) {
      issues.push("bilingual layout だが minutes-bilingual-template seed 欠落");
    }
  }

  return issues;
}

export function formatLanguageBridgeReport(resolved = resolveLanguageBridge()): string {
  const lines = [
    "# Language Bridge — 言語解決",
    "",
    `| 軸 | コード | ラベル |`,
    `|----|--------|--------|`,
    `| ユーザー言語 | \`${resolved.userLanguage}\` | ${resolved.userLabel} |`,
    `| システム言語 | \`${resolved.systemLanguage}\` | ${resolved.systemLabel} |`,
    `| ブリッジ | ${resolved.bridged ? "**要**（言語が異なる）" : "不要（同一言語）"} | |`,
    "",
    `- **record_strategy:** ${resolved.recordStrategy}`,
    `- **layout:** ${resolved.layout}`,
    `- **config:** ${resolved.configPath ?? "(seed/example のみ)"}`,
    "",
  ];

  if (resolved.bridged) {
    lines.push(
      "## 運用",
      "",
      "- Agent 対話 · 要約 → **ユーザー言語**",
      "- 議事録 · 決議 · 登記提出 MD → **システム言語**（正本）",
      "- `npm run orgos -- operations locale-bridge draft --type board_minutes --write`",
      ""
    );
  }

  return lines.join("\n");
}

export function buildDocumentFrontmatter(docType: string): string {
  const resolved = resolveLanguageBridge();
  const policy = getDocumentTypePolicy(docType);
  return [
    "---",
    "steward:",
    `  module: ${MODULE_ID}`,
    `  doc_type: ${docType}`,
    `  user_language: ${resolved.userLanguage}`,
    `  system_language: ${resolved.systemLanguage}`,
    `  layout: ${resolved.layout}`,
    `  primary: ${policy.primary}`,
    `  secondary: ${policy.secondary ?? "none"}`,
    "  status: draft",
    "---",
    "",
  ].join("\n");
}

export function buildMinutesDraftMarkdown(opts: {
  docType: string;
  title: string;
  date?: string;
}): string {
  const resolved = resolveLanguageBridge();
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const fm = buildDocumentFrontmatter(opts.docType);

  if (!resolved.bridged) {
    return (
      fm +
      `# ${opts.title} — ${date}\n\n` +
      `**Language:** ${resolved.userLanguage}\n\n` +
      `## 議題\n\n1. [TBD]\n\n## 決議\n\n1. [TBD]\n`
    );
  }

  const systemHeading =
    resolved.systemLanguage === "zh-Hant"
      ? "董事會會議記錄"
      : resolved.systemLanguage === "ja"
        ? "議事録"
        : "Official record";
  const userHeading = "Executive summary";

  return (
    fm +
    `# ${opts.title} — ${date} / ${systemHeading} — ${date}\n\n` +
    `> **Language bridge:** System (\`${resolved.systemLanguage}\`) is authoritative. User (\`${resolved.userLanguage}\`) section is for review.\n\n` +
    `## [SYSTEM] 正本 — ${resolved.systemLabel}\n\n` +
    `**Date / 日期:** ${date}\n\n` +
    `### 決議 / Resolutions\n\n1. [TBD]\n\n` +
    `---\n\n` +
    `## [USER] ${userHeading} — ${resolved.userLabel}\n\n` +
    `### Key decisions\n\n1. [TBD]\n\n` +
    `*Draft: language_bridge · 段承認前 [TBD] を置換*\n`
  );
}

export function minutesDraftPath(slug: string, date = new Date().toISOString().slice(0, 10)): string {
  const safe = slug
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "minutes";
  return resolveTenantPath(`${MINUTES_DIR_REL}/${date}-${safe}.md`);
}
