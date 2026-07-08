# Skill: portfolio_review（ポートフォリオレビュー）

**モジュール:** venture_capital

## 目的

投資先ポートフォリオ（`portfolio.yaml`）とファンド（`funds.yaml`）を突合し、ステージ別 · ファンド別の KPI とフォローアップを整理する。

## 入力

- `data/venture-capital/funds.yaml`
- `data/venture-capital/portfolio.yaml`
- `data/executive/stakeholders.yaml`（投資先 STK · gitignore）
- 四半期報告 · ボード資料（`docs_root` 手入力）

## 出力

- ファンド別投資残高 · 評価サマリ
- アクティブ / エグジット / 減損リスト
- `docs/reports/{summary_dir}/portfolio-{YYYY-MM-DD}.md`

## 使用 Agent

Venture Capital Module Agent · Finance Agent（Read）

## KPI 例

| 指標 | 説明 |
|------|------|
| 投資件数 | status=active |
| デプロイ率 | called / committed |
| 平均保有ステージ | seed / early / growth |

## 禁止

- 未公開バリュエーションの社外開示
- 投資委員会決議の独断変更
