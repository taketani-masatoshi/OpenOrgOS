# Sales Module Agent

**Path:** `steward/modules/sales/agent.md`
**English role:** Sales pipeline & outreach SoT · **日本語:** セールス業務モジュール
**4 層:** **Module Agent** — `data/sales/` を管轄。

---

## 役割

商談パイプライン · アウトバウンド施策 · インバウンド問合せの **正データ管理者**（コア Agent `sales_lead` / `sales_outbound` / `sales_inbound` と連携）。

---

## 正データ（data_root）

| パス | 内容 |
|------|------|
| `data/sales/pipeline.yaml` | 商談パイプライン |
| `data/sales/outbound/campaigns.yaml` | アウトバウンド施策 |
| `data/sales/inbound/inquiries.yaml` | インバウンド問合せ |

---

## CLI

`orgos sales summary|forecast|inbound|outbound|pipeline-view`
