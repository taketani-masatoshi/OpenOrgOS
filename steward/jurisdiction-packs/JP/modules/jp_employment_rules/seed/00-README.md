# jp_employment_rules seed

就業規則（労基法89条・90条・106条）と36協定（36条）の準備・点検用の架空サンプル（サンプル商事株式会社）。
違反・要確認を検出できるよう、意図的に不備のあるレコードを含む（各ファイルのコメント参照）。

| ファイル | 内容 | テナントでの分類 |
|----------|------|------------------|
| `workplaces.yaml.example` | 事業場 · 常時使用する労働者数 · 交替制 | L1 |
| `work-rules.yaml.example` | 就業規則の届出 · 意見書 · 記載事項 · 周知 | L1 |
| `agreements.yaml.example` | 36協定の内容 · 有効期間 · 届出 · 周知 | L1 |
| `overtime-records.yaml.example` | 従業員別 月次時間外・休日労働実績 | **L2（gitignore 推奨）** |
| `sources.yaml.example` | 一次資料 URL（取得日つき）· 書式カタログ | L0 |
| `templates/*.md.example` | 就業規則骨子 · 36協定届 記載項目 | L0 |

人物は `employee_id` のみで参照する（氏名・住所・連絡先を書かない）。

テナント有効化時:

```bash
mkdir -p tenants/{id}/data/hr/employment-rules
cp steward/jurisdiction-packs/JP/modules/jp_employment_rules/seed/*.example tenants/{id}/data/hr/employment-rules/
# overtime-records.yaml は .gitignore に追加
```

`modules.yaml` 例:

```yaml
modules:
  - id: jp_employment_rules
    agent: jp_employment_rules
    enabled: true
    data_root: data/hr/employment-rules/
    docs_root: docs/company/hr/work-rules/
```
