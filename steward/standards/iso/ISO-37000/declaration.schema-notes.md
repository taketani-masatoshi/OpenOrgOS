# ISO 37000 自己宣言 YAML — スキーマ注記

**正本スキーマ:** `schemas/org/iso-37000-self-declaration.ts`  
**テナントパス:** `data/compliance/iso-37000-self-declaration.yaml`

## フィールド

| フィールド | 説明 |
| --- | --- |
| `schema_version` | 常に `1` |
| `standard` | 常に `ISO-37000` |
| `status` | `draft` → `ready`（点検充足）→ `self_declared`（人間署名） |
| `company_name` | `data/company.yaml` の name（init 時） |
| `signatory_role` / `signatory_name` | 署名者（役職・氏名） |
| `signed_at` | ISO 8601 · `declare` 時に設定 |
| `review_cycle` | `annual`（既定）または `biennial` |
| `last_assessment` | 直近の `orgos governance principles status` スナップショット |

## 制約

- `self_declared` にするには P-01…P-11 の証拠と purpose 実文言が充足していること（CLI が拒否）。
- 本 YAML は **自己宣言の記録** であり、第三者認証クレームではない。
- L2 値を書かない。

## CLI

```bash
orgos governance principles init
orgos governance principles status
orgos governance principles declare --signatory "氏名"
```
