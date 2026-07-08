# メモ: 南アフリカ — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `za_sita_mios`  
**Hub:** `HUB-AF-ZA`（Wave 4）

---

## 中核プラットフォーム

| 系統 | 用途 |
|------|------|
| **SITA** | State Information Technology Agency — 国家 IT インフラ |
| **MIOS** | Minimum Interoperability Standards — G2G/G2B/G2C 相互運用 |
| **国家 e-Gov 戦略** | ポータルバックエンド統合 |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| 標準 | オープン標準 · OAI-PMH（メタデータ）等 |
| プロトコル | REST · SOAP（レガシー混在） |
| 統合 | 国家ポータル経由のサービス配送 |

---

## OpenOrgOS Wire ラップ

- `za_sita_mios` — G2G encode/decode  
- 意味論レイヤは **MIOS ガイド +  bilateral 合意** が必要

---

## 注意

- 治安 · **短時間監査** · 現地パートナー必須  
- Adapter 優先 **P4**

---

## 参考

- SITA MIOS 公開資料（国家 e-Gov 戦略文書）
