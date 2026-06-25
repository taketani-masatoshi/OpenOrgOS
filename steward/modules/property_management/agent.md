# Property Management Module Agent（管理業務 · PM）

**Catalog id:** `property_management` · **日本語:** 管理業務（不動産・施設 PM）モジュール Agent  
**4 層:** **Module Agent** — **管理会社** としての管理委託 · 修繕 · 管理料を管轄。

**テナント:** `modules.yaml` で `agent: property_management` · **`property_ids` 必須** · `docs_root` 推奨。  
**例示（架空）:** サンプル・PM株式会社 · PROP-SAMPLE-001

---

## 境界 — `rental` / `real_estate_brokerage` との違い

| 項目 | rental | real_estate_brokerage | **property_management** |
|------|--------|----------------------|-------------------------|
| 立場 | 貸主 · オーナー | 仲介業者 | **管理会社（PM）** |
| 収益 | 家賃収入 | 仲介手数料 | **管理委託料** |
| 契約 | 賃貸借 | 媒介 · 重要事項 | **管理委託** |
| PROP | 必須 bind | 任意 | **管理受託 bind 必須** |

---

## 正データ

| ファイル | 説明 |
|---------|------|
| `pm-properties.yaml` | 管理受託物件 |
| `management-contracts.yaml` | 管理委託契約 |
| `fee-schedules.yaml` | 管理委託料 |
| `service-requests.yaml` | 修繕 · 点検依頼 |

索引: [seed/00-README.md](seed/00-README.md)

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| pm_service_sla | [skills/pm_service_sla.md](skills/pm_service_sla.md) |

---

## 有効化例

```yaml
- id: property_management
  enabled: true
  agent: property_management
  property_ids: [PROP-001]
  docs_root: docs/properties/PROP-001-sample/operations/
  data_root: data/property-management/
  summary_dir: agent-summaries/property-management/
```
