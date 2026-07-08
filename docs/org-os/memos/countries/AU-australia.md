# メモ: 豪州 — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `au_apigovau` · `au_agdis`  
**Hub:** なし（**シドニー satellite** · 正本は NZ オークランド）

---

## 中核プラットフォーム

| 系統 | 用途 |
|------|------|
| **api.gov.au** | Whole-of-Government API Design Standard |
| **AGDIS** | Australian Government Digital ID System |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| 一般 API | REST · OpenAPI · WoG 設計標準 |
| Digital ID | **Digital ID Act 2024** · OIDC Schedule 2 プロファイル |
| 認証 | OAuth2 / OIDC（AGDIS） |

---

## OpenOrgOS Wire ラップ

- B2B Wire 配送: `au_apigovau`  
- 本人確認連携（任意）: `au_agdis`  
- NZ（`nz_api_standard`）と **別国 · 別 profile**

---

## 注意

- オセアニア Hub 正本 = オークランド NZ  
- Adapter 優先 **P3**

---

## 参考

- https://api.gov.au/
- Digital ID Act 2024 · AGDIS 技術仕様
