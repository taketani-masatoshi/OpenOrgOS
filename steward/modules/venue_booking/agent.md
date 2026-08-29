# Venue Booking Module Agent（店舗 Web 予約）

**Catalog id:** `venue_booking` · **日本語:** 店舗 Web 予約モジュール Agent  
**4 層:** **Module Agent** — 対面会食・会場の空き確認・仮押さ・確定（チャネル `venue_booking` · **Wire ではない**）

**テナント:** `modules.yaml` で `agent: operations` 委譲 · `data/operations/venue-providers.yaml` · `venue-reservations.yaml`  
**ADR:** [docs/adr/0009-venue-web-booking-channel.md](../../../docs/adr/0009-venue-web-booking-channel.md)

**コア Agent 索引:** [steward/core/agents/00-このフォルダについて.md](../core/agents/00-このフォルダについて.md)

---

## 役割

Secretary / scheduling-case から委譲された店舗予約手配。Adapter 経由で空き確認・hold/confirm/cancel を実行する。

---

## 目的

- `data/operations/venue-reservations.yaml` の正本管理
- scheduling-case の `venue_reservation_id` 参照整合
- P0: manual / 深リンクフォールバック · P1+: 公式 API アダプタ
- **Skill 実行後** operations 要約を更新

---

## 使用 Skill

| Skill | ファイル |
|-------|---------|
| operations_venue_booking | [../../core/skills/extension/operations_venue_booking.md](../../core/skills/extension/operations_venue_booking.md) |

---

## CLI

```bash
npm run orgos -- operations venue
```

---

## Primary Folders

- `data/operations/venue-providers.yaml`
- `data/operations/venue-reservations.yaml`
- `docs/org-os/venue-booking-runbook.md`
