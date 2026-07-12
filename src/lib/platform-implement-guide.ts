/**
 * Read-only platform implementation advice for the Platform Guide Agent.
 * Invoked by `orgos platform guide` and `skills run platform-implement-guide`.
 * Engineering performs edits; CTO owns architecture decisions; Security owns
 * production gates.
 */

export const PLATFORM_GUIDE_LEGACY_DEPRECATION =
  "DEPRECATED: static platform guide checklist — use `orgos platform extension-check` and `orgos platform registry-verify`";

export function warnLegacyPlatformGuideChecklist(
  stream: NodeJS.WriteStream = process.stderr
): void {
  stream.write(`${PLATFORM_GUIDE_LEGACY_DEPRECATION}\n`);
}

export type PlatformGuideTopic =
  "philosophy" | "agent" | "skill" | "cli" | "module" | "wire" | "eval" | "all";

export const PLATFORM_GUIDE_TOPICS: PlatformGuideTopic[] = [
  "philosophy",
  "agent",
  "skill",
  "cli",
  "module",
  "wire",
  "eval",
];

export interface PlatformGuideSection {
  topic: PlatformGuideTopic;
  title: string;
  lines: string[];
}

const SECTIONS: PlatformGuideSection[] = [
  {
    topic: "philosophy",
    title: "OpenOrgOS 思想 · OrgOS 用語",
    lines: [
      "正本: docs/org-os/openorgos-core-philosophy.md · docs/org-os/orgos-vocabulary.md",
      "Core = Org Event Model · Identity · Authority · Audit（組織間プロトコル核 · LLM 不要）",
      "Wire / Witness Hub = 組織間配送 · 第三者証拠（Implementation から分離）",
      "Implementation = Agent · Skill · CLI · tenants/{id}/（テナント内部管理）",
      "内部のみの機能を protocol 要件にしない",
      "正本: Markdown + YAML + orgos CLI + テスト（steward/rules/tool-neutral-development.md）",
      "Agent 参照は Path 第一 · Cursor @ は任意",
    ],
  },
  {
    topic: "agent",
    title: "コア Agent 追加（1 件ずつ）",
    lines: [
      "本チェックリストは read-only advisor 出力。registry・コード・文書の編集は Engineering へ Work Order",
      "1. steward/core/agents/{id}_agent.md（finance_agent.md を雛形）",
      "2. steward/core/agents/registry.yaml に id · path · scope（version 3 catalog 正本）",
      "3. npm run agent:catalog:sync（schemas/generated/agent-ids.ts 生成）",
      "4. npm run agent:capability:sync · routing/registry.yaml 更新",
      "5. orgos platform registry-verify",
      "6. orgos operator export --agent {id}",
      "7. npm run validate · orgos agent readiness --agent {id}",
      "Primary Folders · 要約先 · 禁止事項を agent.md に明記",
      "L2/L3 を agent 定義に書かない",
    ],
  },
  {
    topic: "skill",
    title: "Skill 追加（1 件ずつ）",
    lines: [
      "1. steward/core/skills/{id}.md または steward/modules/{mod}/skills/{id}.md",
      "2. runtime: cli を最優先（集計 · validate · 生成）",
      "3. runtime: agent は対話が必要なときのみ（cursor-only 新規禁止）",
      "4. registry.yaml に id · file · runtime · cli_command · agent",
      "5. src/commands/skills.ts に handler（CLI skill の場合）",
      "6. orgos skills list で登録確認",
      "Skill MD に Path · CLI · 入力/出力 · 禁止を記載",
    ],
  },
  {
    topic: "cli",
    title: "CLI 追加（1 件ずつ）",
    lines: [
      "1. ドメインロジック: src/lib/{domain}/",
      "2. Handler: src/commands/ または module cli/commands.ts",
      "3. 業務 module: cli/register.ts → ModuleCliBundle → MODULE_CLI_BUNDLES",
      "4. src/cli/registrars/ に commander 登録",
      "5. 対応 Skill MD の CLI 節を更新",
      "6. npm run validate · tests/ に追加（platform または catalog tier）",
      "mutation は --operator-id + ORGOS_OPERATOR_KEY（本番）",
    ],
  },
  {
    topic: "module",
    title: "業務モジュール追加（1 件ずつ）",
    lines: [
      "正本: steward/modules/module_contract.md",
      "1. steward/modules/{id}/module.manifest.yaml",
      "2. agent.md · seed/*.example · 任意 skills/ · cli/",
      "3. schemas/modules.ts moduleAgentId · readiness.yaml tier",
      "4. orgos modules check {id} · orgos modules check --all",
      "5. テナント利用時のみ tenants/{id}/modules.yaml",
      "6. orgos modules activate {id} · modules sync-context",
      "agent.md に実在法人名 · L2 値を書かない（架空サンプルのみ）",
    ],
  },
  {
    topic: "wire",
    title: "Wire / Hub 連携",
    lines: [
      "正本: docs/org-os/wire-gateway-requirements.md · witness-hub-requirements.md",
      "Wire Gateway = 唯一の外部公開 · 業務ロジックは NG",
      "Witness Hub = digest 第三者証拠（本文長期保管は NG）",
      "実装: src/lib/wire-gateway/ · src/lib/protocol/ · schemas/protocol/",
      "テナント: wire-gateway.yaml · peers.yaml · witness-pool.yaml",
      "検証: orgos wire-gateway discover · wire-hub-stack-smoke.sh · doctor --wire-prod",
      "Agent は protocol notice approve · Wire 送信を単独実行しない",
    ],
  },
  {
    topic: "eval",
    title: "評価 · 完了ゲート",
    lines: [
      "npm run orgos -- validate",
      "orgos platform extension-check",
      "orgos platform registry-verify",
      "npm run test:contract（extensibility · readiness）",
      "npm run test:tiered または npm test（CI 正本）",
      "orgos agent readiness --agent {id}",
      "orgos agent pulse --agent {id}",
      "Agent 変更時: orgos operator export --agent {id}",
      "要約: docs/reports/agent-summaries/platform-guide/{date}-{topic}.md",
    ],
  },
];

export function resolvePlatformGuideTopics(topic: string | undefined): PlatformGuideTopic[] {
  if (!topic || topic === "all") return PLATFORM_GUIDE_TOPICS;
  const t = topic as PlatformGuideTopic;
  if (!PLATFORM_GUIDE_TOPICS.includes(t)) {
    throw new Error(`Unknown topic: ${topic}. Use: all, ${PLATFORM_GUIDE_TOPICS.join(", ")}`);
  }
  return [t];
}

export function buildPlatformGuideMarkdown(topics: PlatformGuideTopic[]): string {
  const selected = new Set(topics);
  const parts: string[] = [
    "# Platform Implementation Guide",
    "",
    "**Agent:** `steward/core/agents/platform_guide_agent.md`",
    "**権限:** developer 明示起動の read-only consult（自身は編集しない）",
    "**委譲:** 実装=Engineering · 設計判断=CTO · 本番 gate=Security",
    "**原則:** 1 成果物ずつ · CLI/Skill で評価",
    "",
  ];

  for (const section of SECTIONS) {
    if (!selected.has(section.topic)) continue;
    parts.push(`## ${section.title}`, "");
    for (const line of section.lines) {
      parts.push(`- ${line}`);
    }
    parts.push("");
  }

  return parts.join("\n").trimEnd() + "\n";
}

export function buildPlatformGuideJson(topics: PlatformGuideTopic[]): object {
  const selected = new Set(topics);
  return {
    agent: "platform_guide",
    agent_path: "steward/core/agents/platform_guide_agent.md",
    activation: "developer_explicit",
    mode: "consult",
    read_only: true,
    delegates: {
      implementation: "engineering",
      architecture: "cto",
      production_gate: "security",
    },
    topics: SECTIONS.filter((s) => selected.has(s.topic)).map((s) => ({
      topic: s.topic,
      title: s.title,
      checklist: s.lines,
    })),
  };
}
