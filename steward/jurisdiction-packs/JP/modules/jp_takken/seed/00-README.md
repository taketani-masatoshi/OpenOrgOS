# jp_takken seed（宅地建物取引業）

架空の「サンプル不動産株式会社」を例に、全チェックを通す／検出させるデータを収録。

| ファイル | 内容 | 分類 |
|---------|------|------|
| `license.yaml.example` | 免許（免許権者 · 免許証番号 · 有効期間 · 更新申請日）· 変更届出 · 営業保証金 / 保証協会 | L1 |
| `offices.yaml.example` | 事務所 · 従業者数 · 宅建士（employee_id · 専任 · 宅建士証の有効期限）· 標識 · 帳簿 等 | L1 |
| `transactions.yaml.example` | 取引（売買・交換・貸借 · 媒介・代理 · 35条 · 37条 · 報酬） | L1 |
| `settings.yaml.example` | 消費税の課税区分 · 帳簿 / 従業者名簿の保存年数 | L1 |
| `sources.yaml.example` | 一次資料 URL（e-Gov · 国土交通省）· 確認日 | L0 |
| `templates/document-checklist.md.example` | 35条・37条 記載事項チェックリスト（本文生成はしない） | L0 |
| `validate.ts` | seed の schema 検証（catalog test 用） | — |

検出用に意図的な不備を含む（as of 2026-09-24）: 変更届出の期限超過（CHG-002）· 支店の専任宅建士不足と宅建士証失効（OFF-BR1 / EMP-012）· 報酬額の掲示なし · 報酬上限超過（TX-004 / TX-005）· 37条書面未交付（TX-004）· 契約後の重要事項説明（TX-005）· 低廉な空家等の特例の合意記録なし（TX-006）。

## テナント有効化

```bash
mkdir -p tenants/{id}/data/takken
cp steward/jurisdiction-packs/JP/modules/jp_takken/seed/*.yaml.example tenants/{id}/data/takken/
# 各ファイルの .example を外して実データに置換
```

`modules.yaml` 例:

```yaml
modules:
  - id: jp_takken
    agent: jp_takken
    enabled: true
    data_root: data/takken/
    docs_root: docs/takken/
```

## L2（gitignore · records/ 側）

宅建士の氏名・登録番号・宅建士証の写し、従業者名簿の本体、取引当事者の氏名・住所、帳簿本体、口座情報は `records/takken/`（gitignore）に置き、本 data には `employee_id` / `stakeholder_id` だけを書く。
