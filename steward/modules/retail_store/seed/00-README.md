# retail_store モジュール — seed データ

`modules.yaml` の `data_root` へコピーする雛形。

```bash
mkdir -p data/retail-store
cp steward/modules/retail_store/seed/*.example data/retail-store/
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `stores.yaml.example` | stores 台帳 |
| `skus.yaml.example` | skus 台帳 |
