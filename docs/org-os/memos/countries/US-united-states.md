# メモ: 米国 — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `us_fed_api` · `us_oscal`  
**Hub:** `HUB-US`（NY · Wave 3 · DE 法人登記）

---

## 中核プラットフォーム

**単一の全国 X-Road 型相互運用レイヤは存在しない。** 連邦は agency 別 API + 共通認証・認可の組み合わせ。

| 系統 | 用途 |
|------|------|
| **Agency REST API** | 各省庁・独立機関ごとの API |
| **FedRAMP / OSCAL** | クラウド認可 · NIST OSCAL 機械可読コンプライアンス |
| **Login.gov** | 連邦市民向け ID · OAuth/OIDC |
| **SAM.gov** | 連邦調達 · 事業者登録 |

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| プロトコル | REST · JSON（agency 別） |
| 認証 | OAuth2 · API Key · mTLS（機関別） |
| 州 | StateRAMP 等 — 州 wire は **別 profile** |

---

## OpenOrgOS Wire ラップ

- B2B Org 間: OpenOrgOS `EventEnvelope` 正本  
- B2G 届出: `us_fed_api` — **agency 別スキーママップ**  
- コンプライアンス artifact: `us_oscal`（Wire 補助 · 配送本体ではない）

---

## 注意

- NY Hub ≠ 連邦 GW — 物理拠点と規制接続は分離  
- agency 追加のたび profile 拡張が必要  
- Adapter 優先 **P3**

---

## 参考

- https://www.fedramp.gov/
- https://pages.nist.gov/OSCAL/
