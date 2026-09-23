# jp_subcontractor_act seed

中小受託取引適正化法（取適法 · 旧下請法）点検用の架空データ。各ルールの検出（fail / needs_review / 対象外）を確認できる取引を含む。

| ファイル | 内容 | 分類 |
|------|------|------|
| `settings.yaml.example` | 自社（委託事業者）の資本金 · 常時使用する従業員数 | L1 |
| `subcontract-parties.yaml.example` | `vendor_id` ごとの受託側規模（資本金 · 従業員 · 時点） | L1 |
| `transactions.yaml.example` | 発注 · 明示 · 受領 · 支払期日 · 支払 · 減額 · 返品 · イベント · 記録保存 | L1 |
| `sources.yaml.example` | 一次資料 URL と取得日 | L0 |

受託先の名称・連絡先は `data/procurement/vendors.yaml`（procurement SoT）が正本。個人事業者の住所・口座・個人電話（L2）はここにも vendors にも書かず、tenant の gitignore 側（`records/`）で管理する。

テナント有効化時:

```bash
mkdir -p tenants/{id}/data/procurement/subcontract
cp steward/jurisdiction-packs/JP/modules/jp_subcontractor_act/seed/*.yaml.example tenants/{id}/data/procurement/subcontract/
# .example を外して実データに置換（架空の VEN-SC-* は vendors.yaml の id に合わせる）
```

`modules.yaml` 例:

```yaml
modules:
  - id: jp_subcontractor_act
    agent: jp_subcontractor_act
    enabled: true
    data_root: data/procurement/subcontract/
    docs_root: docs/procurement/subcontract/
```
