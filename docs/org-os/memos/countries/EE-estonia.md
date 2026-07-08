# メモ: エストニア — 政府系通信規格

**調査日:** 2026-07-07  
**OpenOrgOS profile:** `xroad_v7` · `xroad_v6`（legacy）  
**Hub:** `HUB-EU-EE`（タリン · Wave 1 · Treasury）

---

## 中核プラットフォーム

**X-Road** — 北欧発の G2G/G2B 相互運用フレームワーク。Security Server（SS）が member/subsystem/service 単位でメッセージを中継。

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| プロトコル | REST · SOAP/XML |
| 識別 | `memberCode` · `subsystemCode` · `serviceCode` |
| トレース | `requestId` · `correlationId` |
| 署名 | 機関証明書 · SS 間 TLS |

---

## OpenOrgOS Wire ラップ

| EventEnvelope | X-Road |
|---------------|--------|
| `origin.org_id` | member / subsystem |
| `event_id` | requestId |
| envelope 全文 | SOAP body / REST · `application/vnd.openorgos.envelope+json` |
| `correlation_id` | correlationId |

**profile:** [xroad-adapter.profile.yaml](../../../steward/jurisdiction-packs/EE/protocol/xroad-adapter.profile.yaml)

---

## 注意

- タリン Treasury / Fund と **同一法域 substance** を揃える  
- B2G（登記・税）と Org 間 B2B Wire は用途を分離  
- EU 域では **eDelivery AS4** と compose 可能

---

## 参考

- https://x-road.global/
