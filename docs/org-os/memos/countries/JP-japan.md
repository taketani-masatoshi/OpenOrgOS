# メモ: 日本 — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `jp_egov_central` · `jp_lgwan` · `jp_gbiz`  
**Hub:** `HUB-APAC-JP`（東京 · Wave 1）

---

## 中核プラットフォーム

| 系統 | 用途 |
|------|------|
| **e-Gov インフラ** | デジタル庁 · 各省府 API · 電子申請連携 |
| **LGWAN** | 地方公共団体専用閉域ネットワーク |
| **Gビズ / 法人番号** | 法人番号公表 · 情報提供サービス |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| プロトコル | HTTPS REST · 府省個別 XML/JSON |
| 認証 | GPKI / JPKI · マイナンバーカード連携（用途別） |
| 閉域 | LGWAN はインターネット非接続 |

---

## OpenOrgOS Wire ラップ

- B2B Org 間: `EventEnvelope` を OpenOrgOS MIME で配送  
- B2G 届出: 府省定義スキーマへ `envelope_mapping`  
- **profile:** [egov-adapter.profile.yaml](../../../steward/jurisdiction-packs/JP/protocol/egov-adapter.profile.yaml)

---

## 注意

- 東京 Hub は **薄い APAC + NPO 寄付窓口**（運営本部なし）  
- LGWAN 接続は Hub 物理配置と **経路を分離**  
- 府省ごとに API 登録・スキーマが異なる — profile を分割

---

## 参考

- https://www.e-gov.go.jp/
