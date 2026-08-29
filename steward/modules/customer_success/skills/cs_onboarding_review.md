# Skill: cs_onboarding_review

## 目的

オンボーディングマイルストーンの遅延を決定論集計し、要約 MD を出力する。

## 入力 SoT

- `data/customers/onboarding.yaml`
- `data/customers/accounts.yaml`

## CLI

```bash
orgos skills run cs-onboarding-review
orgos operations customer-success onboarding
```

## 出力

`docs/reports/agent-summaries/customer-success/{YYYY-MM-DD}-onboarding.md`

## 禁止

- 顧客個人名 · 連絡先の出力
- マイルストーン完了の単独確定（人間確認）
