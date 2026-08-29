# Skill: cs_health_check

## 目的

顧客ヘルススコア · 宣言 vs 算出 drift · ヘルス内訳を決定論集計し、要約 MD を出力する。

## 入力 SoT

- `data/customers/accounts.yaml` — health 宣言 SSOT
- `data/customers/health-signals.yaml` — 利用 · サポート
- `data/customers/onboarding.yaml` — オンボーディング遅延
- `data/customers/nps.yaml` — 最新 NPS
- `steward/modules/customer_success/health-rubric.yaml` — スコア rubric

## CLI

```bash
orgos skills run cs-health
orgos sales customers --scores
orgos operations customer-success health
```

## 出力

`docs/reports/agent-summaries/customer-success/{YYYY-MM-DD}-health.md`

## 判断境界

- drift 検出時は **人間が health 宣言を更新するか、シグナルを修正する** — Agent は単独確定しない
- `churned` は churn-event 駆動 · 算出対象外

## 禁止

- 顧客 PII · 連絡先の Chat / tracked MD 出力
- health 宣言の Agent 単独変更
