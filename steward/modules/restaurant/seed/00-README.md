# restaurant モジュール — seed データ

`modules.yaml` の `data_root` へコピーする雛形。

```bash
mkdir -p data/restaurant
cp steward/modules/restaurant/seed/*.example data/restaurant/
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `tables.yaml.example` | tables 台帳 |
| `menu.yaml.example` | menu 台帳 |
