# membership モジュール — seed データ

`modules.yaml` の `data_root` へコピーする雛形。

```bash
mkdir -p data/membership
cp steward/modules/membership/seed/*.example data/membership/
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `plans.yaml.example` | plans 台帳 |
| `members.yaml.example` | members 台帳 |
