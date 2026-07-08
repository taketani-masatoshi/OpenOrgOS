# professional_services モジュール — seed データ

`modules.yaml` の `data_root` へコピーする雛形。

```bash
mkdir -p data/services
cp steward/modules/professional_services/seed/projects.yaml.example data/services/projects.yaml
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `projects.yaml.example` | 受託案件台帳 |
