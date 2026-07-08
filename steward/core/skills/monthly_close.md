# Skill: monthly_close（月次決算）

## 目的

指定月の収支を締め、月次 YAML と要約 MD を更新する。

## 入力

- `data/finance/monthly/{YYYY-MM}.yaml`
- `data/finance/fixed-assets.yaml`（減価償却整理仕訳）
- `data/finance/chart-of-accounts.yaml`（科目マッピング）
- 領収書・経費データ（`docs/finance/accounting/`）
- 物件 Agent からの収益前提（賃貸 · 宿泊モジュール）

## 出力

- 更新済 `finances/monthly/{YYYY-MM}.yaml`
- `docs/reports/agent-summaries/finance/{YYYY-MM}-close.md`
- （任意）`docs/reports/monthly/` 連携

## 使用 Agent

Finance Agent

## 保存先

| 種別 | パス |
|------|------|
| 正データ | `data/finance/monthly/` |
| 要約 | `docs/reports/agent-summaries/finance/` |

## CLI

```bash
npm run orgos -- skills run monthly-close --month YYYY-MM
npm run orgos -- finances add --month YYYY-MM
npm run orgos -- deps check --file data/finance/monthly/YYYY-MM.yaml
npm run validate
npm run orgos -- sync all
```

## 禁止

- 契約条項の変更
- 経営判断（投資優先度等）
