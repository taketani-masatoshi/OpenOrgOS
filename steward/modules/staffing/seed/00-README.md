# staffing モジュール — seed データ

`modules.yaml` の `data_root` へコピーする雛形。

```bash
mkdir -p data/staffing
cp steward/modules/staffing/seed/*.example data/staffing/
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `staff.yaml.example` | staff 台帳 |
| `assignments.yaml.example` | assignments 台帳 |
