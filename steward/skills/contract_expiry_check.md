# Skill: contract_expiry_check（契約期限確認）

## 目的

全 CTR の更新・満了期限をチェックし、アラート一覧を生成する。

## 入力

- `data/contracts/*.yaml`（maturity · renewal · status）
- `docs/exports/契約管理表.csv`

## 出力

- 期限一覧 MD（90 / 60 / 30 日）
- P0 draft 一覧
- `docs/reports/agent-summaries/contract/expiry-{YYYY-MM-DD}.md`

## 使用 Agent

Property Rental Agent（賃貸モジュール CTR）

## 保存先

`docs/reports/agent-summaries/contract/`

## CLI

```bash
npm run steward -- alerts
npm run steward -- contracts list
```

## 禁止

- 契約更新の自動締結
- Executive へのエスカレーション省略（P0 は必須）
