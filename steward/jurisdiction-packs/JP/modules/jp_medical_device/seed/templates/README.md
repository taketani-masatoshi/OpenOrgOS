# 医療機器 QMS / GVP 文書テンプレート

テナント非依存の正本。会社固有の値は置かない。

## 差し込み

`orgos operations medical-device qms draft` / `gvp draft` が `cli/shared.ts` の `fillTemplate` で置換する。

| 変数 | 出典 |
|------|------|
| `{{company.name}}` | `data/company.yaml` の商号 |
| `{{company.representative}}` | 同上（代表者表示） |
| `{{doc_number}}` | カタログの文書番号 |
| `{{effective_date}}` | 実行日 |
| `{{business_roles}}` | 業許可台帳の役割 |
| `{{device_scope}}` / `{{device.*}}` | 品目台帳 |

社内規程 REG-025 / REG-026 は `orgos regulations seed --ids REG-025,REG-026` が同じ `{{company.name}}` を置換する。

## やらないこと

- テンプレートへ特定テナント名をハードコードしない
- 許可番号 · 個人住所 · 患者識別を書かない
- 当局への自動提出手順を置かない
