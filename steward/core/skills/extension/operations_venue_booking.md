# Skill: operations_venue_booking

## 目的

店舗 Web 予約（会食 · 対面会場）— チャネル `venue_booking`（**Wire ではない**）

## 使用 Agent

Operations Agent · Secretary（SCH から委譲）

## CLI

```bash
npm run orgos -- operations venue
```

## 出力

`data/operations/venue-reservations.yaml` · scheduling-case の `venue_reservation_id`

## 関連

- Runbook: `docs/org-os/venue-booking-runbook.md`
- ADR: `docs/adr/0009-venue-web-booking-channel.md`
