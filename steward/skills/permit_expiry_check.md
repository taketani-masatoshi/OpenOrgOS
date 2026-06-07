# Skill: permit_expiry_check（許認可・保険期限確認）

## 目的

許認可・保険・届出の期限と CTR-013/014 状態を確認する。

## 入力

- `docs/company/licenses/INDEX.csv`
- `data/contracts/CTR-013.yaml` · `CTR-014.yaml`
- `docs/compliance/iso/` 監査計画（任意）

## 出力

- 期限アラート MD
- 未加入・draft 保険 P0 一覧
- `docs/reports/agent-summaries/compliance/permit-{YYYY-MM-DD}.md`

## 使用 Agent

Compliance Agent · Contract Agent（保険 CTR）

## 保存先

`docs/reports/agent-summaries/compliance/`

## CLI

```bash
npm run steward -- alerts
```

## 禁止

- 許可証内容の invent
- secrets 監査時の値の出力
