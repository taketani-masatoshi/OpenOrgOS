# 株式会社MAL — テナントコンテキスト

**正本:** `tenants/mal/tenant.yaml` · **`modules.yaml`** · **Agent 参照用**（L1 以下）

---

## 法人

| 項目 | 値 |
|------|-----|
| 法人名 | 株式会社MAL |
| 代表 | 段燕燕（100% 株主） |
| 旧商号 | 株式会社ほんとのあなた（2024-12-27 に MAL へ変更） |
| 公開メール | info@malkk.com |

## 事業

有効モジュールは **`modules.yaml`** が正本。

| モジュール | 物件 | 正データ |
|------|------|---------|
| rental | 番町ハイム312（PROP-001） | `data/properties/PROP-001.yaml` |
| hospitality | 亀沢旅館（PROP-002） | `data/properties/PROP-002.yaml` |
| サービス | Steward OS 保守委託等 | `data/contracts/CTR-001.yaml` 他 |

## 主要利害関係者（索引）

詳細は `data/executive/stakeholders.yaml`（gitignore）· `docs/executive/stakeholders/`。

| ID | 概要 | 関係 |
|----|------|------|
| STK-001 | 竹谷昌敏 | CTR-001 業務委託（個人 · KLab） |
| STK-003 | 株式会社サウスウッド | PROP-001 テナント（CTR-003） |
| STK-004 | 株式会社日本住宅 | PROP-002 売主・建築（CTR-006/007） |

## Agent 向け注意

- パス表記 `data/` · `docs/` は **本テナント（mal）内**を指す
- 竹谷氏 ≠ サウスウッド契約当事者 — 混同禁止
- 財務数値の社外開示は Executive Steward 経由

## 会社固有規程

`docs/company/regulations/` — REG-001 〜 REG-010 等。Compliance Agent が管轄。
