# Skill: contract_register（契約台帳作成・更新）

## 目的

CTR YAML と契約 MD・契約管理表 CSV を整合させる。

## 入力

- `cursor/data/contracts/CTR-*.yaml`
- `docs/contracts/CTR-*/**`
- inbox 原本（Operations 归档後）

## 出力

- 更新済 CTR YAML/MD
- `docs/data/契約管理表.csv`（sync 後）
- `docs/reports/agent-summaries/contract/register-{YYYY-MM-DD}.md`

## 使用 Agent

Contract Agent · Operations Agent（inbox→归档）

## 保存先

| 種別 | パス |
|------|------|
| 正データ | `cursor/data/contracts/` |
| 本文 | `docs/contracts/` |
| CSV | `docs/data/契約管理表.csv` |

## CLI

```bash
npm run steward -- contracts show CTR-XXX
npm run steward -- sync contracts
npm run validate
npm run steward -- deps check --file cursor/data/contracts/CTR-XXX.yaml
```

## 禁止

- 月次財務 YAML の直接編集（Finance へ反映依頼）
