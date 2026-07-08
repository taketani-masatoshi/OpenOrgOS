# hospitality モジュール — seed データ

`modules.yaml` の `operations_public` · `operations_secrets` パスへコピーする雛形。

```bash
# tenants/{id}/ で実行（パスは modules.yaml に合わせる）
cp steward/modules/hospitality/seed/operations-public.yaml.example data/operations/{facility}-public.yaml
cp steward/modules/hospitality/seed/operations-secrets.yaml.example data/operations/{facility}-secrets.yaml
# secrets は gitignore · 実値を記入
npm run validate
```

| ファイル | 内容 |
|---------|------|
| `operations-public.yaml.example` | 公開運用情報 |
| `operations-secrets.yaml.example` | 機密（Wi-Fi・鍵等） |
