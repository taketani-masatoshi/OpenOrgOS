# data/venture-capital/ — VC モジュール正データ

**論理パス:** `data/venture-capital/` · **スキーマ:** `schemas/venture-capital.ts`

雛形の正本: [steward/modules/venture_capital/seed/](../../../../steward/modules/venture_capital/seed/00-README.md)

```bash
mkdir -p data/venture-capital
cp steward/modules/venture_capital/seed/funds.yaml.example data/venture-capital/funds.yaml
cp steward/modules/venture_capital/seed/portfolio.yaml.example data/venture-capital/portfolio.yaml
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `funds.yaml` | ファンド台帳（FUND-xxx） |
| `portfolio.yaml` | 投資先台帳（PC-xxx） |
