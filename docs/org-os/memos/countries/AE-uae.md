# メモ: UAE — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `ae_uae_api` · `ae_open_finance`  
**Hub:** `HUB-ME`（ドバイ DIFC · Wave 1）

---

## 中核プラットフォーム

| 系統 | 用途 |
|------|------|
| **UAE API Marketplace** | TDRA 管轄 · 政府 API カタログ · API-First Policy |
| **UAEPASS** | 連邦デジタル ID · シングルサインオン |
| **Open Finance Hub** | CBUAE · 金融 API 中央ハブ · Trust Framework |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| プロトコル | REST · OpenAPI |
| 認証 | OAuth2 · UAEPASS 連携 |
| 金融 | 別 Trust Framework · 口座分離（Treasury vs Fund と同型の思想） |

---

## OpenOrgOS Wire ラップ

- 一般行政: `ae_uae_api`  
- 金融 wire: `ae_open_finance`（別 profile · 口座・コンプライアンス分離）  
- **witness_mode:** `orgos_hub` 推奨

---

## 注意

- ドバイ FZCO = ME 地域財布 · substance 必須  
- 金融と一般行政は **profile を分離**

---

## 参考

- https://oecd-opsi.org/innovations/uae-api-market-place/
