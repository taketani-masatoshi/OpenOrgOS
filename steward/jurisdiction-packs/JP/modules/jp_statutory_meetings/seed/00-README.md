# jp_statutory_meetings seed

株主総会・取締役会の招集・決議・議事録の **準備支援** 用サンプル（架空データ）。

| ファイル | 内容 | 分類 |
|------|------|------|
| `meetings.yaml.example` | 会議一覧（ガバナンス SoT · `governance_meeting_prep` と共用） | L1 |
| `statutory-meetings.yaml.example` | 法定手続の詳細（同じ会議 id をキー） | L1 |
| `governance-settings.yaml.example` | 機関設計 · 定款の定め · 役員（`stakeholder_id` 参照） | L1 |
| `sources.yaml.example` | 一次資料 URL（e-Gov）· 取得日 · ひな形カタログ | L0 |
| `templates/*.md.example` | 招集通知 · 議事録 · 提案書兼同意書 · みなし決議議事録 | L0 |

`SM-2026-EGM-07`（招集期限超過 · 口頭通知 · 基準日3か月超 · 特別決議不足 · 議事録不備）と
`BM-2026-WR-08`（定款規定なしの取締役会書面決議）は、checklist の検出を確認するための **意図的な不備** を含む。

テナント有効化時:

```bash
mkdir -p tenants/{id}/data/governance/templates
# meetings.yaml が既にある場合は上書きせず、statutory-meetings.yaml に同じ id で詳細を追加する
cp steward/jurisdiction-packs/JP/modules/jp_statutory_meetings/seed/statutory-meetings.yaml.example tenants/{id}/data/governance/statutory-meetings.yaml
cp steward/jurisdiction-packs/JP/modules/jp_statutory_meetings/seed/governance-settings.yaml.example tenants/{id}/data/governance/governance-settings.yaml
```

テナントに `data/governance/meetings.yaml` がある場合、`statutory-meetings.yaml` と `governance-settings.yaml` も
テナント側から読み込む（架空 seed と実データを混在させない）。

株主名簿 · 株主の個人住所 · 同意書原本のスキャンは L2 — `records/governance/`（gitignore）に置き、tracked ファイルへ転記しない。

`modules.yaml` 例:

```yaml
modules:
  - id: jp_statutory_meetings
    agent: jp_statutory_meetings
    enabled: true
    data_root: data/governance/
    docs_root: docs/company/governance/
```
