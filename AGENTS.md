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

## 6. 関連

- [steward_os_principles.md](steward_os_principles.md)
- [agent_skill_architecture.md](agent_skill_architecture.md)
- [secretary_steward_boundary.md](secretary_steward_boundary.md)


## Quick commands

```bash
orgos chat today
orgos validate
orgos dashboard
```

Canonical: `steward/rules/operator-policy.md`
