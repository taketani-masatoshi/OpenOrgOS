# メモ: インド — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `in_api_setu`  
**Hub:** なし（APAC は東京）

---

## 中核プラットフォーム

| 系統 | 用途 |
|------|------|
| **API Setu** | MeitY 統合 API マーケットプレイス — 4200+ API |
| **DigiLocker** | デジタル書類 · 市民ウォレット |
| **MeriPehchaan** | 国民デジタル ID 連携 |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| プロトコル | REST · JSON |
| 認証 | OAuth 2.0 · HMAC |
| onboarding | パートナー登録 · API キー発行 |

---

## OpenOrgOS Wire ラップ

- `in_api_setu` — ドキュメント/サービス API を envelope にマップ  
- 身份連携は DigiLocker / MeriPehchaan を別 binding  
- APAC Witness = 東京 Hub

---

## 注意

- 国标/標準交換ファミリー（CN · ZA と近い）  
- Adapter 優先 **P4**

---

## 参考

- https://www.apisetu.gov.in/
