# construction モジュール — seed データ

`modules.yaml` の `data_root` へコピーする雛形。

```bash
mkdir -p data/construction
cp steward/modules/construction/seed/*.example data/construction/
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `sites.yaml.example` | sites 台帳 |
| `phases.yaml.example` | phases 台帳 |
