# jp_visa_employment seed

すべて **架空サンプル**（as_of 2026-09-24 基準で各チェックが発火するよう意図的な不備を含む）。

| seed | 分類 | 内容 |
|------|------|------|
| `foreign-workers.yaml.example` | **L2**（テナントでは gitignore） | employee_id · 在留資格コード · 在留期間満了日 · カード確認日/確認者 · 資格外活動許可 · 業務区分 · 雇入れ/離職日 · ハローワーク届出日 |
| `weekly-hours.yaml.example` | **L2**（テナントでは gitignore） | 資格外活動の週次就労時間 · 長期休業期間フラグ · 他就労先時間（本人申告） |
| `status-catalog.yaml.example` | L0 | 在留資格コード → 就労区分（入管法19条1項）· 業務区分の対応表 |
| `sources.yaml.example` | L0 | 一次資料 URL · 取得日 |
| `validate.ts` | — | catalog harness 用 seed 検証 |

**保存禁止:** 在留カード番号 · 旅券番号 · 国籍 · 住所 · 氏名 · 個人電話 · マイナンバー。schema は `strict` で未定義キーを拒否する。

テナント有効化時:

```bash
mkdir -p tenants/{id}/data/hr/foreign-workers
cp steward/jurisdiction-packs/JP/modules/jp_visa_employment/seed/status-catalog.yaml.example tenants/{id}/data/hr/foreign-workers/status-catalog.yaml
cp steward/jurisdiction-packs/JP/modules/jp_visa_employment/seed/sources.yaml.example tenants/{id}/data/hr/foreign-workers/sources.yaml
# foreign-workers.yaml · weekly-hours.yaml は空で作成し、.gitignore に追加（L2）
```

`.gitignore`（テナント）例:

```gitignore
data/hr/foreign-workers/foreign-workers.yaml
data/hr/foreign-workers/weekly-hours.yaml
```

`modules.yaml` 例:

```yaml
modules:
  - id: jp_visa_employment
    agent: jp_visa_employment
    enabled: true
    data_root: data/hr/foreign-workers/
    docs_root: docs/company/hr/foreign-workers/
```
