# OTA 取込 runbook（Booking / Airbnb）

**前提:** 業許可取得後 · CTR-010 Airbnb executed · CTR-011 Booking.com（締結後）

## E0 — 手動 Extranet

1. Booking.com Extranet / Airbnb から予約 CSV または iCal をエクスポート
2. CSV 列（推奨）:

```csv
check_in,check_out,party_size,ota_ref,rate_per_night_jpy,channel
2026-08-10,2026-08-12,5,BK-DEMO-001,50000,booking
```

3. 取込:

```bash
STEWARD_TENANT=mal npm run orgos -- operations hospitality ota-import \
  --file /path/to/export.csv --property PROP-002 --format csv
```

iCal:

```bash
STEWARD_TENANT=mal npm run orgos -- operations hospitality ota-import \
  --file /path/to/calendar.ics --property PROP-002 --format ical
```

4. 重複警告が出たら Extranet と `stays.yaml` を突合

## 非スコープ（本フェーズ）

- 在庫・料金の双方向同期
- 公式 API（opt-in は将来 adapter）
