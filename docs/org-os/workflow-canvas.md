# Workflow canvas（構成議論面）

**版:** 1.0 · **日付:** 2026-09-17  
**状態:** 読取 UI/API · 決定論 evaluate · WFS propose / validate / apply（APR 必須）  
**ADR:** [0077](../adr/0077-workflow-structure-discussion-gate.md)

## 目的と区別

| 面 | 正本 | 用途 |
|----|------|------|
| **会社の構成図（SSOT）** | `tenants/{id}/data/org/workflows/{workflow_id}.yaml` | 承認後の確定グラフ |
| **構成案（draft）** | キャンバス state のみ | 議論・試行。会社の図ではない |
| **評価対案** | evaluate 応答の `proposed_document` | 決定論（+ 任意 LLM overlay） |
| **記録済み提案** | `data/org/workflow-changes/WFS-…yaml` | 適用待ち。図はまだ変えない |

保存ボタンで YAML を直書きしない。hospitality の `change_plan` / `change_apply` は使わない。

## データ

スキーマ: `schemas/workflow-canvas.ts` · 変更: `schemas/workflow-structure-change.ts`

- `workflow_id`: `WF-…`
- ノード型: `aia_agent` · `business_task` · `system_module`
- 提案 ID: `WFS-YYYYMMDD-NNN`
- 承認 `subject_type`: `workflow.structure`
- 等級: A（既定）· B（規程参照必須）· C（apply 禁止）

デモ種（mal）: `tenants/mal/data/org/workflows/WF-system-map.yaml`

## 変更申請（WFS）

| 操作 | Console（BFF） | CLI | 権限 |
|---|---|---|---|
| 一覧 | `GET /chat/v1/workflow` | `orgos workflow list` | `chat:read` |
| 読取 | `GET /chat/v1/workflow/:id` | `orgos workflow get --id …` | `chat:read` |
| 投影 | — | `orgos workflow render --id … --format json\|table\|mermaid` | ローカル読取 |
| 評価 | `POST /chat/v1/workflow/evaluate` | `orgos workflow evaluate --file …` | `chat:ask` |
| 提案 | `POST /chat/v1/workflow/change/propose` | `orgos workflow change propose --file … --approval APR-…` | `chat:ask` |
| 差分確認 | `POST /chat/v1/workflow/change/validate` | `orgos workflow change apply --dry-run` | `chat:read` |
| 適用 | `POST /chat/v1/workflow/change/apply` | `orgos workflow change apply --file …` | `chat:approve` |

- 提案は `data/org/workflow-changes/` に保存。監査: `data/org/workflow-change-audit.jsonl`
- 適用は APR が `approved` / `completed` でなければ拒否
- LLM / MCP は apply しない

## UI

Steward Chat `/workflow/` — 役割バナー（正本 / 構成案 / 対案 / 提案済）· 評価 · APR 付き提案 · 承認キューリンク

### 表示モード（投影）

正本は常に `WorkflowDocument`（YAML/JSON）。表・Mermaid・React Flow は決定論の投影であり、第2正本にしない。

| モード | 既定 | 用途 |
|--------|------|------|
| **表** | ○ | nodes / edges 一覧 + JSON。Cursor・監査・差分向け |
| **キャンバス** | | React Flow（議論・接続操作）。見た目確認は外部ブラウザ推奨 |
| **テキスト図** | | Mermaid ソース（PR / チャット転写）。操作しない |

- 編集入口: JSON textarea · キャンバス操作のみ（表 / Mermaid は読取専用）
- `position` は表示ヒントとして正本に残してよい（表投影では出さない）
- React Flow はキャンバスモードのときだけマウントする
- CLI: `orgos workflow render --id WF-… --format json|table|mermaid`

エージェント検証・レビューは表 / JSON / Mermaid を正とする。Cursor 内蔵ブラウザは補助。

## 関連

- `src/lib/workflow-canvas/`（`projections.ts` · serialize · evaluate · store）· `src/lib/steward-chat/routes/workflow-api.ts`
- [org-chart.md](org-chart.md)（OCH 同型ゲート）
