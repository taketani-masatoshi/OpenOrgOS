# jp_patent_application seed

特許出願の書類ドラフト・期限管理用の雛形（架空データ · L1 以下）。

| ファイル | 内容 |
|------|------|
| `patent-registry.yaml.example` | 出願案件台帳（優先権主張 · 新規性喪失の例外 · 審査請求 · 登録 · 年金） |
| `specifications/<id>.yaml.example` | 明細書・特許請求の範囲・要約書の入力（様式第29 / 29の2 / 31 の見出し） |
| `field-map.yaml.example` | 願書の出願人欄 → `company.yaml` の写像 |
| `holidays.yaml.example` | 行政機関の休日（2026–2027 の国民の祝日 + 年末年始）— 特許法3条2項の期限順延 |
| `sources.yaml.example` | 一次資料 URL（取得日つき）· 書式カタログ · 確認済み料金 |
| `templates/*.md.example` | 特許願 · 明細書 · 特許請求の範囲 · 要約書 |
| `validate.ts` | seed の整合チェック（catalog テスト用） |

`PAT-2026-002` は検出テスト用に形式違反（請求項の欠番・マルチマルチ・要約 400 字超・30条の公報公開など）を意図的に含む。

テナント有効化時:

```bash
mkdir -p tenants/{id}/data/ip/patent/specifications tenants/{id}/data/ip/patent/templates
cp steward/jurisdiction-packs/JP/modules/jp_patent_application/seed/*.yaml.example tenants/{id}/data/ip/patent/
cp steward/jurisdiction-packs/JP/modules/jp_patent_application/seed/templates/*.example tenants/{id}/data/ip/patent/templates/
# 各ファイルの .example を外して実データに置き換える
```

`modules.yaml` 例:

```yaml
modules:
  - id: jp_patent_application
    agent: jp_patent_application
    enabled: true
    data_root: data/ip/patent/
    docs_root: docs/ip/patent/
```

## データ分類

- 発明者・共同出願人は `stakeholder_id` のみ。**氏名・住所（L2）は台帳に書かない**。願書ドラフトは `（要記入）` のまま出力し、人間が L2 正本から転記する。
- 未公開の発明内容（`specifications/`）は出願公開まで営業秘密。テナントでは gitignore を推奨（L2 扱い）。
- `holidays.yaml` は毎年、内閣府の公表で `covered_years` を追記する。範囲外の年の期限は `needs_review`。
