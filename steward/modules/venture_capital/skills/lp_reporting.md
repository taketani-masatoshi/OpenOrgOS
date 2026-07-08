# Skill: lp_reporting（LP 報告）

**モジュール:** venture_capital

## 目的

LP 向け四半期 / 年次報告の下書き材料を整備する（キャピタルコール · 分配 · ポートフォリオハイライト）。

## 入力

- `data/venture-capital/funds.yaml`（committed · called）
- `data/venture-capital/portfolio.yaml`（ハイライト投資先）
- `data/finance/**`（分配 · キャリー関連行 · Read）
- LP 契約 CTR（Contract Agent 索引）

## 出力

- LP レター下書き MD（`docs_root/reports/`）
- `docs/reports/{summary_dir}/lp-report-{YYYY-Q}.md`

## 使用 Agent

Venture Capital Module Agent · Finance Agent（協調）· Compliance Agent（利益相反確認）

## 禁止

- LP 個別のコミットメント額を L1 以上で社外転記
- 報告確定前の自動送信
