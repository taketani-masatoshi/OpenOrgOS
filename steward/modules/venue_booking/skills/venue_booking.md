# Skill: venue_booking（会場予約の受付）

## Runtime

**agent** — 会食・会場の予約依頼を対話で受け付ける。

## 目的

日時・人数・エリア・予算を確定し、会場予約（VR-*）につなぐ。

## 手順

1. 日時・人数・エリア・予算を確認する（不足は質問する）。
2. 候補提示: `npm run orgos -- skills run venue-catalog`
3. 予約実行: `orgos operations venue reserve`（決定は人間が承認）
4. 予約確認: `npm run orgos -- skills run venue-list`

## 参照

- Module: `steward/modules/venue_booking/agent.md`
- ADR: `docs/adr/0009-venue-web-booking-channel.md`
