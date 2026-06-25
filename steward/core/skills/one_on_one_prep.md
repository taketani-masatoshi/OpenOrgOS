# Skill: one_on_one_prep（1-on-1 準備）

## 目的

1-on-1 実施前に、議題・宿題・関連タスクをまとめた **準備ブリーフ** を生成する。

## 入力

| データ | パス |
|--------|------|
| 1-on-1 レジストリ | `data/executive/one-on-ones.yaml` |
| 社長タスク | `data/executive/tasks.yaml` |
| カレンダー | `data/executive/calendar.yaml` |
| 役員情報 | `data/company.yaml` · `data/hr/employees.yaml` |

## 出力

| 種別 | パス |
|------|------|
| 1-on-1 準備 MD | `docs/executive/one-on-one-prep-{person}-{YYYY-MM-DD}.md` |

## 使用 Agent

| Agent | 役割 |
|-------|------|
| **Secretary**（主） | ブリーフ生成・action_items 更新 |
| Executive Steward | 財務 P0 の **ルート記載のみ**（数値は読まない） |

## ワークフロー

1. `one-on-ones.yaml` から対象 `person` のエントリを取得
2. `action_items` の未完了を「前回宿題」に列挙
3. `tasks.yaml` で `category: hr` または `delegated_to` 関連を抽出
4. `calendar.yaml` で当日・前後の予定を確認
5. 議題案を 3–5 点提案（`topics` + 未完了タスクから）
6. 財務・契約が議題に含まれる場合 → Executive Steward へ委譲行を追記
7. 生成後、`next_date` ・ `action_items` を必要に応じて YAML 更新

## 出力テンプレート

[steward/agents/secretary_agent.md](../steward/agents/secretary_agent.md) の「1-on-1 準備」形式。  
運用詳細: [docs/executive/one-on-one-guide.md](../docs/executive/one-on-one-guide.md)

## 禁止

- 財務 YAML・契約 MD の直接参照
- 1-on-1 相手の個人情報（住所・給与）の記載
