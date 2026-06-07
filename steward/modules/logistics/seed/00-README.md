# logistics モジュール — seed データ

`modules.yaml` の `data_root` へコピーする雛形。

```bash
mkdir -p data/logistics
cp steward/modules/logistics/seed/*.example data/logistics/
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `warehouses.yaml.example` | warehouses 台帳 |
| `shipments.yaml.example` | shipments 台帳 |
