# AGENTS.md — OrgOS Operator

# OrgOS Operator Policy

**版:** 1.0 · **日付:** 2026-06-28  
**正本:** 本書（ツール非依存）· データ分類正本: テナント `data/classification-registry.yaml` · [folder_access_policy.md](folder_access_policy.md)

LLM オペレーター（Cursor · Cline · Aider · OpenHands · Steward Chat 等）が OrgOS workspace を操作するときの **必須ルール**。

---

## 1. 4 層と読取境界

```
CEO（人間）→ 判断 · 承認のみ
Executive Steward（LLM）→ dashboard / agent-summaries / executive-notes のみ
部門 Agent（LLM）→ 担当 Primary Folders のみ
Skill + CLI → 決定論処理（validate · 集計 · 生成）
Data → YAML/MD 正本
```

| 主体 | 読取 | 禁止 |
|------|------|------|
| **Executive Steward** | `docs/reports/dashboard/` · `agent-summaries/` · `executive-notes/` | `data/**/*.yaml` 直読 · 契約本文詳細 |
| **Secretary** | `data/executive/**` · 要約行のみ dashboard | `data/finance/**` · `data/contracts/**` |
| **Finance / Contract / Compliance / Operations** | 各 `steward/core/agents/*_agent.md` の Primary Folders | 担当外編集 |
| **Operator（汎用 LLM）** | ユーザ指示 + Today コンテキスト + 担当 Agent 定義 | L2/L3 値の出力 · 全フォルダ一括 @ |

---

## 2. データ分類（L0–L3）

| レベル | AI 自動 | 出力禁止 |
|--------|---------|----------|
| L0–L1 | 可 | — |
| L2 | `@file` / 担当 Agent のみ | tracked MD · チャットへの転記 |
| L3 | 禁止 | L2 の要約混入 |

- 口座・個人住所は **`bank_account_id` / `stakeholder_id` リンクのみ**
- 振込実行は **`orgos broker transfer`** — チャットに口座番号を出さない

---

## 3. CLI 必須手順

データ変更後:

```bash
orgos validate
```

Work Order 完了前:

```bash
orgos validate
orgos escalate complete --id IMP-... --notes "..."
```

日次経営確認:

```bash
orgos chat today
# または
orgos dashboard
```

---

## 4. 承認ゲート

| 操作 | 主体 | CLI |
|------|------|-----|
| 組織間 wire 送信 | CEO / 承認者 | `protocol notice approve` |
| 内部稟議 | 承認者 | `org approval approve` |
| 最終決定 | **人間** | Agent は提案・下書きのみ |

---

## 5. 生成物

| 種別 | パス |
|------|------|
| Agent 要約 | `docs/reports/agent-summaries/` |
| 経営ダッシュボード | `docs/reports/dashboard/` |
| Work Order | `docs/reports/routing-queue/` |
| 会社イベント | `orgos events new` → `docs/company/events/` |

---

## 7. マルチツール互換（Cursor 以外）

Agent 定義（`steward/core/agents/*.md`）は **Markdown 正本** — Claude · ChatGPT · Cline · Aider · Continue 等でも利用可。

| 手段 | コマンド / パス |
|------|----------------|
| Agent パック出力 | `orgos operator export --agent finance` / `--all` |
| AGENTS.md 同期 | `orgos operator sync-policy --emit agents-md` |
| MCP（Today · 承認） | `orgos mcp start` · snippet: `steward/platform/agent/exports/mcp/` |
| Shell 実行 | `ORGOS_SHELL_PROFILE=aider` · `orgos agent dispatch run --runtime shell` |
| OpenAI 互換 API | `OPENAI_API_KEY` / `ORGOS_LLM_API_URL` · `orgos chat ask` |

Work Order プロンプトは **Path + Cursor @ 参照** を併記（ツール中立）。

Skill `runtime`: `cli`（LLM 不要）· `agent`（LLM + 定義添付 · 旧 `cursor-only` と同義）。

---

## 8. 関連

- [tool-neutral-development.md](tool-neutral-development.md) — **今後の開発ガイド（Cursor 非依存）**
- [steward_os_principles.md](steward_os_principles.md)
- [agent_skill_architecture.md](agent_skill_architecture.md)
- [secretary_steward_boundary.md](secretary_steward_boundary.md)


## Multi-tool portability

Agent 定義は **Markdown（ツール非依存）**。Cursor 以外でも利用できます。

| ツール | 使い方 |
|--------|--------|
| **Claude / ChatGPT** | `orgos operator export --agent <id>` の pack を system / project に貼付 |
| **Aider / Cline** | `ORGOS_SHELL_PROFILE=aider` · Work Order プロンプト MD |
| **Continue / Claude Desktop** | `orgos mcp start` — snippet: `steward/platform/agent/exports/mcp/` |
| **Steward Chat** | OpenAI 互換 API · `orgos chat ask` |
| **Cursor** | `@steward/core/agents/*_agent.md` · `.cursor/rules/operator-policy.mdc` |

```bash
orgos operator export --all
orgos operator sync-policy --emit all
```

正本 Agent: `steward/core/agents/` · Export index: `steward/platform/agent/exports/INDEX.md`

## Development guide（Cursor 非依存）

**今後の開発は Cursor を前提にしない。** 正本: [steward/rules/tool-neutral-development.md](steward/rules/tool-neutral-development.md)

- 正本は `steward/rules/` · `src/` · テスト — `.cursor/` はミラーのみ
- 新 Skill は `runtime: cli` 優先 · `cursor-only` 新規禁止
- Agent 参照は **Path 第一** · 変更後 `orgos operator export`

## Quick commands

```bash
orgos chat today
orgos validate
orgos dashboard
orgos operator export --agent finance
```

Canonical: `steward/rules/operator-policy.md`
