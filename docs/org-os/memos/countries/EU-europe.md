# メモ: 欧州（EU 横断）— 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `eu_edelivery_as4`  
**Hub:** タリン（EE）+ ダブリン（IE）で EU 域をカバー

---

## 中核プラットフォーム

| 系統 | 用途 |
|------|------|
| **EIF 2017** | European Interoperability Framework（改訂進行中） |
| **CEF eDelivery** | 4-corner model · **AS4** messaging |
| **eIDAS** | 越境 eSignature · eID |
| **SDG** | Single Digital Gateway |
| **EBSI** | European Blockchain Services Infrastructure |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| 輸送 | **AS4**（Access Point 間） |
| モデル | 4-corner（sender AP → receiver AP） |
| 関連 | X-Road（EE/フィンランド等）と **compose** 可能 |

---

## OpenOrgOS Wire ラップ

- EU 越境 G2G: `eu_edelivery_as4`  
- 国内: メンバー州 profile（IE `ie_psb_api` · EE `xroad_v7`）  
- eIDAS 署名は identity レイヤとして分離

---

## 注意

- 「EU」は jurisdiction `EU` — メンバー州法と併用  
- EIF 改訂 · eIDAS 2.0 ウォレット — 追従必要  
- Adapter 優先 **P3**

---

## 参考

- https://interoperable-europe.ec.europa.eu/
- CEF eDelivery ドキュメント
