# rental モジュール — seed データ

`modules.yaml` の `docs_root` 配下に展開する運用ドキュメント雛形の索引。

```bash
# tenants/{id}/ で実行（docs_root は modules.yaml に合わせる）
mkdir -p docs/properties/PROP-001-minato/operations/templates/rental
# steward/modules/rental/seed/templates/ から必要な CSV・MD をコピー
```

| ファイル | 用途 |
|---------|------|
| `templates/rent/賃料入金確認.csv` | 月次入金記録 |
| `templates/rent/修繕問合せ記録.csv` | 修繕・問合せ |
| `templates/rent/定期点検-年次.md` | 年次点検チェック |
