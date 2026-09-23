# jp_labor_contract seed

雇用契約・労働条件通知書モジュールの雛形。値はすべて架空（サンプル商事）。

| ファイル | 分類 | 内容 |
|------|------|------|
| `labor-contracts.yaml.example` | **L2**（賃金額） | 労働契約台帳 — 明示事項 · 期間 · 就業場所の都道府県 · 賃金 |
| `fixed-term-history.yaml.example` | L1 | 満了済み有期契約の期間（労契法18条の通算用） |
| `minimum-wages.yaml.example` | L0 | 地域別最低賃金（令和7年度 · 厚労省一覧）· `verified_through` |
| `sources.yaml.example` | L0 | 公表資料 URL（取得日つき）· 書式カタログ |
| `templates/rodo-joken-tsuchisho.md.example` | L0 | 労働条件通知書 MD ひな形 |

テナント有効化時:

```bash
mkdir -p tenants/{id}/data/hr/labor-contracts/templates
cp steward/jurisdiction-packs/JP/modules/jp_labor_contract/seed/*.example tenants/{id}/data/hr/labor-contracts/
cp steward/jurisdiction-packs/JP/modules/jp_labor_contract/seed/templates/*.example tenants/{id}/data/hr/labor-contracts/templates/
# 拡張子 .example を外す。labor-contracts.yaml は L2 — テナントの .gitignore に追加する
```

テナントの `.gitignore` 例:

```gitignore
data/hr/labor-contracts/labor-contracts.yaml
```

`modules.yaml` 例:

```yaml
modules:
  - id: jp_labor_contract
    agent: jp_labor_contract
    enabled: true
    data_root: data/hr/labor-contracts/
    docs_root: docs/company/hr/labor-contracts/
```

## seed の検出用レコード

| 契約 | 検出される事項 |
|------|------|
| `LC-2026-001` | 不備なし（無期 · 月給 · 東京都） |
| `LC-2026-002` | 最低賃金（大阪府）未満 · 就業場所の変更の範囲が未記載 |
| `LC-2026-003` | 契約期間4年 — 労基法14条の3年上限超過 |
| `LC-2025-004` / `LC-2026-005` | 通算ちょうど5年 → 次回契約で無期転換申込権発生（5条5項の明示あり） |
| `LC-2026-006` | 更新上限の途中新設で理由説明日なし · 雇止め予告期限経過 |
| `LC-2026-007` | 高度専門職の5年特例・試用期間12か月 → `needs_review` |
