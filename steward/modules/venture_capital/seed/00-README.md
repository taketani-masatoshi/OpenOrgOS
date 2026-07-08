# venture_capital モジュール — seed データ

テナント有効化時に `modules.yaml` の `data_root` へコピーする雛形。

```bash
# tenants/{id}/ で実行
mkdir -p data/venture-capital
cp steward/modules/venture_capital/seed/funds.yaml.example data/venture-capital/funds.yaml
cp steward/modules/venture_capital/seed/portfolio.yaml.example data/venture-capital/portfolio.yaml
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `funds.yaml.example` | ファンド台帳（FUND-xxx） |
| `portfolio.yaml.example` | 投資先台帳（PC-xxx） |
