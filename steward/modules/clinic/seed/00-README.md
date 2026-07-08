# clinic モジュール — seed データ

`modules.yaml` の `data_root` へコピーする雛形。

```bash
mkdir -p data/clinic
cp steward/modules/clinic/seed/*.example data/clinic/
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `departments.yaml.example` | departments 台帳 |
| `appointments.yaml.example` | appointments 台帳 |
