# Skill: cs_renewal_risk

## 目的

更新期日 horizon 内の顧客 · ヘルス状態 · 残日数を決定論集計し、更新リスク要約を出力する。

## 入力 SoT

- `data/customers/accounts.yaml` — `renewal_date` · `health`

## CLI

```bash
orgos skills run cs-renewal
orgos sales customers [--days 90]
```

## オプション

- `--days <n>` — 更新 horizon（既定 90 日）

## 出力

`docs/reports/agent-summaries/customer-success/{YYYY-MM-DD}-renewal.md`

## 判断境界

- 契約更新条件の変更は **Contract Agent** へ委譲
- 更新交渉文案は下書きのみ · 人間承認必須

## 禁止

- 契約変更の単独確定
- 顧客連絡先の出力
