# jp_data_breach seed

個人データ漏えい等の報告（個人情報保護法26条 · 施行規則7〜10条）の準備支援用雛形。すべて架空データ。

| ファイル | 内容 | 分類 |
|----------|------|------|
| `incidents.yaml.example` | 漏えい等事案台帳（各判定ルールを通るサンプル 6 件） | テナントでは **L2 相当 · gitignore 推奨** |
| `holidays.yaml.example` | 国民の祝日（確報期限の休日繰延べ用 · 内閣府 CSV 転記） | L0 |
| `sources.yaml.example` | 一次資料 URL · 取得日 · 下書き書式カタログ | L0 |
| `templates/report-preliminary.md.example` | 速報 記載項目下書き | — |
| `templates/report-final.md.example` | 確報 記載項目下書き | — |
| `validate.ts` | catalog テスト用 seed 検証 | — |

サンプル事案と期待される判定（as of 2026-09-24）:

| id | 判定 | 見どころ |
|----|------|----------|
| BR-2026-001 | reportable（①） | 確報期限 2026-09-30 が近い（due_soon） |
| BR-2026-002 | reportable（③） | 取得しようとしている個人情報（2024-04-01 施行）· 速報 GL 目安超過 · 60日目が日曜 → 2026-10-19 |
| BR-2026-003 | not_reportable | 本人の数 1,000 ちょうど（「千人を超える」に非該当） |
| BR-2026-004 | needs_review | 本人の数・不正目的とも unknown |
| BR-2026-005 | not_reportable | 高度な暗号化 + 復号鍵漏えいなし → 除外 |
| BR-2026-006 | reportable（④）· 受託者免除 | 委託元へ通知済 → 報告・本人通知義務免除 |

テナント有効化時:

```bash
mkdir -p tenants/{id}/data/privacy/breach/templates
cp steward/jurisdiction-packs/JP/modules/jp_data_breach/seed/*.yaml.example tenants/{id}/data/privacy/breach/
cp steward/jurisdiction-packs/JP/modules/jp_data_breach/seed/templates/*.example tenants/{id}/data/privacy/breach/templates/
# .example を外し、incidents.yaml は実事案に置き換える（gitignore 推奨）
```

`modules.yaml` 例:

```yaml
modules:
  - id: jp_data_breach
    agent: jp_data_breach
    enabled: true
    data_root: data/privacy/breach/
    docs_root: docs/compliance/privacy/breach/
```
