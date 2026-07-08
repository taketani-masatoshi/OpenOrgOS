# メモ: トルコ — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `tr_edevelop`  
**Hub:** `HUB-TR-IST`（イスタンブール · Wave 3）

---

## 中核プラットフォーム

| 系統 | 用途 |
|------|------|
| **e-Devlet Kapısı** | turkiye.gov.tr — 1000+ 機関の市民向けポータル |
| **KamuNET** | 官庁間 VPN · 閉域通信 |
| **G2G Web Services** | 機関間 ESB / Web Services |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| アーキ | 中央ゲートウェイ + ESB — ポイント接続を集約 |
| プロトコル | SOAP · REST（サービス別） |
| 署名 | 電子署名 · モバイル署名 |

---

## OpenOrgOS Wire ラップ

- `tr_edevelop` — G2G encode/decode  
- Hub 役割: AF · 南米 · タリンへの **1 乗継**（transit + Hub 両立）  
- 将来: EU Digital Identity Wallet / EDIC 連携検討

---

## 注意

- 中央 GW 型 — GE · EG · UAE と adapter パターン類似  
- KamuNET 閉域と Hub 公開経路の分離

---

## 参考

- https://www.turkiye.gov.tr/
