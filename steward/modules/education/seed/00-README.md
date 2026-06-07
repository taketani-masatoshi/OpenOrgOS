# education モジュール — seed データ

`modules.yaml` の `data_root` へコピーする雛形。

```bash
mkdir -p data/education
cp steward/modules/education/seed/*.example data/education/
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `courses.yaml.example` | courses 台帳 |
| `classes.yaml.example` | classes 台帳 |
