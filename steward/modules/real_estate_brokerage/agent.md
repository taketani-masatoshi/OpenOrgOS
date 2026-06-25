# Real Estate Brokerage Module Agent（不動産仲介業）

**Catalog id:** `real_estate_brokerage` · **日本語:** 不動産仲介業モジュール Agent  
**4 層:** **Module Agent** — **仲介業者** としての媒介 · 重要事項 · 手数料を管轄。

**テナント:** `modules.yaml` で `agent: real_estate_brokerage` · `data_root` · **`property_ids` は任意**。  
**例示（架空）:** サンプル不動産仲介株式会社 · DEAL-001

---

## 境界 — `rental` / `property_management` との違い

| 項目 | rental | **real_estate_brokerage** | property_management |
|------|--------|---------------------------|---------------------|
| 立場 | 貸主 · オーナー | **仲介業者** | 管理会社（PM） |
| 収益 | 家賃収入 | **仲介手数料** | 管理委託料 |
| 契約 | 賃貸借 | **媒介 · 重要事項** | 管理委託 |
| PROP | 必須 bind | **任意** | **管理受託 bind 必須** |

---

## 正データ（`data_root`）

| ファイル | 説明 |
|---------|------|
| `listings.yaml` | 媒介 · 紹介物件 |
| `deals.yaml` | 媒介取引 |
| `commissions.yaml` | 仲介手数料 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| deal_pipeline_review | [skills/deal_pipeline_review.md](skills/deal_pipeline_review.md) |

---

## 有効化例

```yaml
- id: real_estate_brokerage
  enabled: true
  agent: real_estate_brokerage
  data_root: data/brokerage/
  property_ids: []
  summary_dir: agent-summaries/brokerage/
```
