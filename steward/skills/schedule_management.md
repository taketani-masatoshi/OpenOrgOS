# Skill: schedule_management（スケジュール管理）

## 目的

社長カレンダーの確認・競合検出・会食・来客の候補提示。Secretary Agent の日常 Skill。

## 入力

| データ | パス |
|--------|------|
| カレンダー | `cursor/data/executive/calendar.yaml` |
| 社長タスク | `cursor/data/executive/tasks.yaml` |
| 社外連絡先 | `cursor/data/executive/external-contacts.yaml` |

## 出力

| 種別 | パス |
|------|------|
| 競合レポート（チャットまたは MD） | `docs/executive/`（任意） |
| カレンダー更新 | `cursor/data/executive/calendar.yaml` |

## 使用 Agent

| Agent | 役割 |
|-------|------|
| **Secretary**（主） | 読取・競合チェック・下書き |
| Executive Steward | **関与しない** |

## ワークフロー

1. `calendar.yaml` の `events` を期間でフィルタ
2. 時間帯の重複を検出（`start` / `end`）
3. `status: tbd` の予定を一覧し、確定タスク（`tasks.yaml`）と紐付け
4. `external_visible: true` のみ社外調整メールに記載可能
5. 更新後 `npm run validate`

## 競合チェックルール

- 同一時間帯に `confirmed` が 2 件以上 → **競合** として報告
- `block` タイプは移動・準備時間として他予定と重複不可
- `travel` は前後 30 分バッファを推奨（警告のみ）

## 将来 CLI

```bash
# npm run steward -- executive calendar list --from 2026-06-01 --to 2026-06-30
# npm run steward -- executive calendar conflicts
```

Phase 0 では手動 YAML 編集 + 本 Skill の手順に従う。

## 禁止

- `cursor/data/finances/**` を日程判断に使わない
- 社外へ `external_visible: false` の予定を開示しない
