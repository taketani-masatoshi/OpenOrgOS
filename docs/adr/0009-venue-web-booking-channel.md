# ADR 0009 — Venue Web Booking Channel（Wire 分離）

- **Status:** Accepted
- **Date:** 2026-07-12
- **Deciders:** OpenOrgOS maintainers

## Context

日程調整（Secretary / scheduling-cases）の対面会食では、店舗の空き確認・仮押さ・確定が必要になる。  
Caster 等の外注秘書は変動費が残る。ブラウザ自動操作は ToS・ログイン・決済リスクが高い。

組織間配送の **Wire / protocol transport** とは目的が異なる（人間向け予約サイト連携 vs peer 間証跡配送）。

## Decision

1. **専用チャネル `venue_booking`** を導入する。Wire（`src/lib/protocol/` · `orgos wire` · peer transport）には載せない。
2. 実装は **モジュール `venue_booking`** + **`src/lib/venue-booking/`** + **Adapter パターン**:
   - `checkAvailability` · `hold` · `confirm` · `cancel`
   - P0: `manual` / 深リンク生成（人が予約）フォールバック
   - P1+: 公式 API があるプロバイダのみ実接続
3. CLI: `orgos operations venue …`（`operations` 配下 · Mail Outbound / Wire と別）
4. 正本: `data/operations/venue-reservations.yaml` · scheduling-case は `venue_reservation_id` 参照のみ
5. 費用・確定は既存 `org approval` / CEO ゲート経由。アダプタは idempotent な依頼 ID を持つ

## Consequences

### Positive

- Wire 信頼境界を汚さない
- 監査・テスト・再現が容易（API / 深リンク）
- Secretary は `venue reserve --case SCH-…` で手配を委譲できる

### Negative / risks

- 全 Web 予約サイトの自動化は対象外（未対応は人手配チケット）
- プロバイダ API キーは L2（gitignore · records）

## Related

- Module: `steward/modules/venue_booking/`
- Lib: `src/lib/venue-booking/`
- Runbook: `docs/org-os/venue-booking-runbook.md`
- Scheduling: `schemas/executive/scheduling-cases.ts`（`venue_reservation_id`）
