# Integration Agent（情報統合）

**版:** 1.0 · **日付:** 2026-08-24  
**ADR:** [0040](../adr/0040-aia-parallel-runtime.md)  
**状態:** 仕様 Accepted · catalog/registry 登録とランタイムは後続実装 PR

## 目的

モジュール横断の要約・照会・Work Order を **常設の統合役** として引き受ける。正データは編集しない。人間承認の代替にならない。

## 4 層上の位置

```
CEO（人間）
  → Executive Steward（経営判断 · KPI）
       → Integration Agent（横断統合 · 本仕様）  ← 新設
            → 部門 / モジュール AIA
                 → Skill + CLI → Data
```

- **Executive:** ダッシュボード / 最終経営判断。Integration の統合結論を読む。
- **Secretary Orchestrator:** プロンプト手順として残す。常設の機械統合は Integration に一本化。
- **COO / routing-queue:** WO 保管は既存。Integration が escalate 起票可。

## Catalog 追記方針（実装 PR で適用）

| フィールド | 値 |
|------------|-----|
| `id` | `integration` |
| `name` / `name_ja` | Integration Agent / 統合 |
| `path` | `steward/core/agents/integration_agent.md` |
| `tier` | `core` |
| `required` | `false`（テナント activation） |
| `reports_to` | `executive_steward` |
| `scope` | モジュール横断要約 · module-messages · WO ハブ |
| `class` | `operational` |
| `dispatch_modes` | `[consult]`（implement は原則しない） |

Roster: `tenants/{id}/data/operator/agents.yaml` で `enabled`。  
ドラフト定義 MD: [integration_agent.md](../../steward/core/agents/integration_agent.md)（本仕様と同期）。

## Primary Folders

| 権限 | パス |
|------|------|
| **読取** | `docs/reports/agent-summaries/` · `docs/reports/routing-queue/` · `docs/reports/dashboard/`（要約行） · `data/org/module-messages/` · fact/command 結果 |
| **書込** | `docs/reports/executive-notes/`（統合メモ） · 照会/統合 MD · module-messages 返信 · `escalate` による WO 起票 |
| **禁止** | 任意モジュール `data_root` / 部門 Primary の直編 · L2 値の転記 · `approveOrgApproval` / Wire 送信 · broker transfer |

## 入出力契約

**入力**

- ModuleMessage（pending）
- agent-summaries の差分
- WO / escalate キュー
- Fact provider / command router の決定論結果

**出力**

1. **統合結論**（L1）— Executive / Chat 向け短い段落  
2. **推奨アクション** — Primary パスと担当 Agent/module を明示  
3. **子 WO**（必要時）— `escalate plan/run`、自動 dispatch 方針はテナント設定（後続）  
4. **message reply** — `intent: reply` · `reply_to`

## 並行実行との関係

- Integration 自身も AIA runtime 枠を消費する（通常 `concurrent_jobs` 相当は低め、推奨 2）。
- 多数モジュールが同時に `inform` しても、Integration はメッセージキューを直列または小並列で処理し、SSOT は触らない。

## Chat 接続（後続）

| 項目 | 方針 |
|------|------|
| ADR 0035 | read skill `integration-brief` — 未読メッセージ + 要約差分 |
| ADR 0033 | モジュール KPI fact を registry に追加し、Integration が brief に含める |

## 非目標

- WASI/container 隔離の実装
- 他テナント・組織間の自動統合（Wire は人間承認）
- L2 の横断インデックス

## 関連

- [module-messaging.md](module-messaging.md)
- [aia-parallel-runtime.md](aia-parallel-runtime.md)
- [secretary_steward_boundary.md](../../steward/rules/secretary_steward_boundary.md)
- `steward/core/orchestrators/secretary_escalation.md`（手順互換）
