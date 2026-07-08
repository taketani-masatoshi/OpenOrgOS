# メモ: シンガポール — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `sg_apex`  
**Hub:** なし（satellite のみ · Witness 不採用）

---

## 中核プラットフォーム

| 系統 | 用途 |
|------|------|
| **APEX** | API Exchange — GovTech 政府 API ゲートウェイ |
| **Singpass** | 個人デジタル ID |
| **CorpPass** | 法人デジタル ID |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| プロトコル | REST · OpenAPI |
| 認証 | OAuth 2.1 · **FAPI 2.0** · PAR |
| 接続 | GovTech Developer Portal |

---

## OpenOrgOS Wire ラップ

- `sg_apex` — API 配送 + 身份連携  
- APAC Witness は **東京 Hub** — SG は adapter のみ将来

---

## 注意

- FAPI 2.0 は HK iAM Smart · AU AGDIS とファミリー共通化可  
- Adapter 優先 **P4**

---

## 参考

- https://www.developer.tech.gov.sg/products/categories/data-and-apis/apex-cloud/features-roadmap
