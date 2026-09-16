/**
 * ADR 0075 — Wire Demo Walkthrough（MAL ↔ Southwood 一本道）
 *
 * - **Status:** Accepted
 * - **Date:** 2026-09-16
 */

## Context

Wire はプロトコル・peers・seed スクリプトが厚い一方、Console では MailWorkbench が
広く、MAL↔Southwood の「起案→承認→配送→ack→証跡」が一画面で追えない。
フル再生は `scripts/seed-inter-org-demo.ts`（破壊的）にあり、UI から回すべきではない。

## Decision

1. **`GET /chat/v1/wire/demo`**（`chat:read`）で L1 のウォークスルーを合成する。
2. **UI は `/wire/demo/`** — 手順と peer / pending / 承認件数、Wire Console・承認へのリンク。
3. **seed は実行しない** — CLI ヒントのみ。本番テナント破壊を避ける。
4. Module Maturity の wire レーンは `/wire/demo/` を指す。

## Consequences

- 対外説明と社内デモが同じ「一本道」になる。
- 3-org / mesh は引き続きテストスクリプト側。

## Related

- [0074](0074-module-maturity-panel.md)
- `scripts/seed-inter-org-demo.ts` · `scripts/lib/three-org-wire-demo.ts`
