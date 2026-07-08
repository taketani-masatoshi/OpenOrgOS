# メモ: チリ — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `cl_pisee` · `cl_chileatiende`  
**Hub:** `HUB-SA`（サンティアゴ · Wave 3）

---

## 中核プラットフォーム

| 系統 | 用途 |
|------|------|
| **PISEE 2** | G2G 相互運用 — **Nodo** ソフトウェア · 機関間 P2P（中央中継なし） |
| **ChileAtiende** | 市民向けサービス API · JSON/XML |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| アーキ | P2P Nodo — X-Road とは異なり中央 SS なし |
| 機能 | デジタル署名 · トレーサビリティ · 監査ログ |
| 市民 API | access_token · REST |

---

## OpenOrgOS Wire ラップ

- G2G 本体: `cl_pisee`  
- 公開サービス情報: `cl_chileatiende`（任意 · Wire 本体とは別）  
- Nodo 設定は機関ごと — peer binding が複雑

---

## 注意

- P2P 型 — ルーティング設計が X-Road/中央 GW と異なる  
- Adapter 優先 **P3**

---

## 参考

- https://pisee.gob.cl/que-es-pisee/
