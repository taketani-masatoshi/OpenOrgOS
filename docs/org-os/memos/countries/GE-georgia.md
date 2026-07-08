# メモ: ジョージア — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `ge_gov_gateway_3g`  
**Hub:** なし

---

## 中核プラットフォーム

**Georgian Government Gateway (3G)** — DGA（Digital Governance Agency）管轄。350+ 行政サービスを中央ゲートウェイ経由で相互接続。

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| アーキ | 中央ゲートウェイ + 機関 adapter |
| プロトコル | JSON/XML · Web Services |
| 署名 | ジョージアデジタル署名 |

---

## OpenOrgOS Wire ラップ

| EventEnvelope | 3G |
|---------------|-----|
| envelope 全文 | 3G 相互運用メッセージ · サービス ID |
| MIME | `application/vnd.openorgos.envelope+json` 推奨 |

**profile:** [georgia-3g-adapter.profile.yaml](../../../steward/jurisdiction-packs/GE/protocol/georgia-3g-adapter.profile.yaml)

---

## 注意

- Adapter 優先 **P4** — Hub 配置なし  
- 中央 GW 型ファミリー（TR · EG · UAE と近い）

---

## 参考

- World Bank GovTech Georgia プログラム
