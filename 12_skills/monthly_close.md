# Skill: monthly_close（月次決算）

## 目的

指定月の収支を締め、月次 YAML と要約 MD を更新する。

## 入力

- `cursor/data/finances/monthly/{YYYY-MM}.yaml`
- 領収書・経費データ（`docs/operations/accounting/`）
- 物件 Agent からの収益前提（番町賃料 · 亀沢宿泊）

## 出力

- 更新済 `finances/monthly/{YYYY-MM}.yaml`
- `docs/reports/agent-summaries/finance/{YYYY-MM}-close.md`
- （任意）`docs/reports/monthly/` 連携

## 使用 Agent

Finance Agent

## 保存先

| 種別 | パス |
|------|------|
| 正データ | `cursor/data/finances/monthly/` |
| 要約 | `docs/reports/agent-summaries/finance/` |

## CLI

```bash
npm run steward -- finances add --month YYYY-MM
npm run steward -- deps check --file cursor/data/finances/monthly/YYYY-MM.yaml
npm run validate
npm run steward -- sync all
```

## 禁止

- 契約条項の変更
- 経営判断（投資優先度等）
