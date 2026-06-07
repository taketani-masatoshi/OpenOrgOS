# {法人名} — テナントコンテキスト

**正本:** `tenants/{tenant-id}/tenant.yaml` · **モジュール:** `modules.yaml` · **Agent 参照用**（L1 以下）

> 新規テナントは本ファイルと `modules.yaml` を編集する。  
> 雛形: [tenants/_template/](../_template/) · 実テナント例: [tenants/mal/rules/company_context.md](../mal/rules/company_context.md)

---

## 法人

| 項目 | 値 |
|------|-----|
| 法人名 | （記入） |
| 代表 | （記入） |
| 公開メール | （記入） |

## 事業モジュール

有効モジュールは **`modules.yaml`** が正本。下表は人間向け索引。

| モジュール id | 区分 | 正データ |
|------|------|---------|
| rental | 賃貸（例: みなとビル501） | `data/properties/PROP-001.yaml` |
| hospitality | 宿泊（例: 緑丘ゲストハウス） | `data/properties/PROP-002.yaml` |

## 主要利害関係者（索引）

詳細は `data/executive/stakeholders.yaml`（gitignore）· `docs/executive/stakeholders/`。

| ID | 概要 | 関係 |
|----|------|------|
| STK-001 | （記入） | （記入） |

## Agent 向け注意

- パス表記 `data/` · `docs/` は **本テナント内**を指す
- 財務数値の社外開示は Executive Steward 経由

## 会社固有規程

`docs/company/regulations/` — Compliance Agent が管轄。
