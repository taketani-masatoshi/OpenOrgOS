# メモ: 香港 — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `hk_iam_smart`  
**Hub:** なし

---

## 中核プラットフォーム

**iAM Smart** / **iAM Smart+** — 政府デジタル身份プラットフォーム。

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| 認証 | OAuth 2.0 |
| 署名 | 電子署名（ETO） |
| 填表 | e-ME（電子フォーム） |
| 接続 | Sandbox → Production |

---

## OpenOrgOS Wire ラップ

- **身份・署名レイヤ**をラップ  
- Wire envelope は MIME 拡張（`application/vnd.openorgos.envelope+json`）  
- B2G 届出と Org 間 B2B を分離

---

## 注意

- OAuth/FAPI ファミリー（SG · AU · JP 身份層と近い）  
- Adapter 優先 **P4**

---

## 参考

- https://www.iamsmart.gov.hk/
- https://iamsmart.cyberport.hk/（開発者 Sandbox）
