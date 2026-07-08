# メモ: アイルランド — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `ie_psb_api`  
**Hub:** `HUB-EU-IE`（ダブリン · Wave 2）

---

## 中核プラットフォーム

| 系統 | 用途 |
|------|------|
| **PSB API Catalogue** | 公共セクター API カタログ |
| **Data Sharing and Governance Act 2019** | データ共有の法的枠組 |
| **Data Sharing Support Suite** | 共有合意 · 技術支援 |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| フレーム | 欧州 **EIF** 4 層（legal · org · semantic · technical） |
| プロトコル | REST · OpenAPI |
| 標準 | datacatalogue.gov.ie API Standards |

---

## OpenOrgOS Wire ラップ

- `ie_psb_api` — 国内 G2G/G2B  
- EU 越境は **`eu_edelivery_as4`** と compose  
- ダブリン Hub = CLG/Ltd コストセンター

---

## 注意

- EU 域カバーは **タリン（X-Road）+ ダブリン（PSB/AS4）** の二拠点  
- EIF 改訂進行中 — semantic 層の追従が必要

---

## 参考

- https://datacatalogue.gov.ie/api_catalogue/
- https://datacatalogue.gov.ie/standards/
