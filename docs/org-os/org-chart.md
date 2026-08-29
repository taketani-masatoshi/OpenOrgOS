# Org Chart（実組織図）

**版:** 1.2 · **日付:** 2026-08-29  
**状態:** 読取 UI/API 実装済み · 履歴スナップショット · 外部専門家（company.yaml）· OCH は Console から propose / validate / apply 可能

## 目的と区別

| 図 | 正本 | 用途 |
|----|------|------|
| **実組織図（本ドキュメント）** | `tenants/{id}/data/org/org-chart.yaml` | 取締役会等で定めた組織単位・報告線 · Canvas |
| **稼働エージェント** | `tenants/{id}/data/operator/agents.yaml` | スチュワード・秘書など、当該テナントで有効な担当。会社の役職ではない |
| **Agent カタログ図** | `steward/core/agents/org-chart.md` | 製品カタログの役割図。実人事ではない |

混同しないこと。人名は L1 組織図に載せない。

## 外部専門家

正本: `data/company.yaml` の `advisors`（種別 `legal` / `tax` / `technical`）。
組織図ノードには載せない。Console `/org/` の「外部専門家」は氏名・事務所・契約有無のみ（メール・連絡先 YAML は出さない）。
一点記録（`as_of`）は組織図履歴のみ。顧問欄は現行の `company.yaml`。

## データ

スキーマ: `schemas/org/org-chart.ts`

- `layer`: `board` | `staff`
- `board_role`: representative_director / outside_non_executive / director / none
- `reports_to`: 報告線（根は省略可）
- 任意 `employee_id` · `canvas_suites`

補助: `data/org/org-authority.yaml`（部門権限 + 計画/実績万円）— [org-budget-delegation.md](org-budget-delegation.md)

## 履歴

OCH 適用時に `data/org/org-chart-history/` へスナップショットを残す。索引は `index.yaml`。

デモ種: `tests/fixtures/org-charts/demo/`（Vitest が `tenants/demo/data` 復元後に overlay）。

GET `/chat/v1/org/chart?as_of=YYYY-MM-DD` で過去の記録を返す。UI の「過去の記録」から切替。

## HTTP / UI

| | |
|--|--|
| GET | `/chat/v1/org/chart` · `?as_of=`（`org-chart-api.ts`） |
| UI | Steward Chat `OrgChartPage.tsx`（会社図 · 履歴 · 外部専門家 · ユーザー） |

## 変更申請（OCH）

`schemas/org/org-chart-change.ts`（`OCH-…` · REG 参照 · approve フロー）。

既定は Console。組織ページ下部の「組織変更（OCH）」で提案 → 差分確認 → 適用まで行う。CLI と同じ lib（`src/lib/org/org-chart-change.ts`）を通る。

| 操作 | Console（BFF） | CLI | 権限 |
|---|---|---|---|
| 提案 | `POST /chat/v1/org/chart/change/propose` | `orgos org chart change propose --file … --approval APR-… --operator OP-001` | `chat:ask` |
| 一覧 | `GET /chat/v1/org/chart/change` | — | `chat:read` |
| 差分確認（dry-run） | `POST /chat/v1/org/chart/change/validate` | `orgos org chart change validate --file …` · `apply --dry-run` | `chat:read` |
| 適用 | `POST /chat/v1/org/chart/change/apply` | `orgos org chart change apply --file … --operator OP-001` | `chat:approve` |

- 提案は `data/org/org-chart-changes/OCH-YYYYMMDD-NNN.yaml` に保存され、`org_chart.change.proposed` を監査に残す。
- 適用は `approval_id` の APR が承認済みでなければ拒否される（承認は承認キュー / `orgos org approval approve`）。適用時に before/after ハッシュと履歴スナップショットを残す。
- `remove` は、そのノードを `reports_to` にしている部門が残っていると lib が拒否する。画面には理由がそのまま出る。

実装: `src/lib/org/org-chart-change.ts` · 監査 `data/org/org-chart-change-audit.jsonl`（`proposed` / `applied`）

## 関連

- [org-budget-delegation.md](org-budget-delegation.md)
- `src/lib/steward-chat/org-chart-view.ts` · `routes/org-chart-api.ts`
