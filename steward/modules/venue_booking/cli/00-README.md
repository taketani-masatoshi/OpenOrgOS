# venue_booking — モジュール CLI

**チャネル:** `venue_booking`（**Wire / protocol とは別経路**）

```bash
npm run orgos -- operations venue providers
npm run orgos -- operations venue catalog
npm run orgos -- operations venue search --venue VENUE-001
npm run orgos -- operations venue reserve --case SCH-2026-001 --venue VENUE-001 --provider hotpepper_deep_link
npm run orgos -- operations venue confirm --id VR-2026-001 --external-ref HP-123 --approval-id APR-…
npm run orgos -- operations venue list
```

正本: `data/operations/venue-reservations.yaml` · ADR: `docs/adr/0009-venue-web-booking-channel.md`
