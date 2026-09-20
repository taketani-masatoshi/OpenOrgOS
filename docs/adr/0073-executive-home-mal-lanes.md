/**
 * ADR 0073 — Executive Home MAL 実務再配線
 *
 * - **Status:** Accepted
 * - **Date:** 2026-09-16
 */

## Context

Executive Home（ADR 0065）の要対応は sales / CS / churn が上位を占め、
MAL の秘書・物件・タスクが朝の画面に出にくかった。Secretary Workbench
（0071）と Property Ops（0072）が揃ったので、ホームをそれらの要約入口に
再配線する。

## Decision

1. **attention に `task` / `property` kind を追加**し、タスク正本・物件 P0 を
   顧客アラートより先に集める。
2. **顧客系アラートは最大4件に抑制**（パイプライン/CS/churn の枠を縮小）。
3. **`lanes` ブロック**で秘書・物件へのショートカットと件数を出す
   （tasks_p0 · mail · approvals · property_due_p0）。
4. メール要対応の遷移先を `/secretary/workbench/` に寄せる。

## Consequences

- Executive Home が「今日のMAL運用」入口になる。
- Module Maturity / Wire デモ / Public Web は後続フェーズ。

## Related

- [0065](0065-executive-home-console.md)
- [0071](0071-executive-tasks-ssot-secretary-workbench.md)
- [0072](0072-property-ops-dashboard.md)
