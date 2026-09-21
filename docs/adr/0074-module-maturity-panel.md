/**
 * ADR 0074 — Module Maturity Panel（＋コア能力レーン）
 *
 * - **Status:** Accepted
 * - **Date:** 2026-09-16
 */

## Context

MAL では enabled モジュールに skeleton / activation_ready が混在する。
`/modules/` の On/Off 一覧だけでは「日次導線が閉じているか」が見えない。
また秘書・タスクは modules.yaml 外のため、カタログ成熟度だけでは秘書レーンが欠ける
（評価メモ B）。

## Decision

1. **`GET /chat/v1/modules/maturity`**（`chat:read`）でパネルを合成する。
2. **UI は `/modules/maturity/`** — 完成度の正本。`/modules/` 一覧は On/Off 操作面。
3. **二軸:**
   - Catalog: enabled × readiness tier。`risk_severity` で skeleton / activation を分離。
   - Core lanes: secretary / mail / task / wire / property_ops。
     `surface`（面の有無）と `load`（idle/active）を分離し、件数0でも operational としうる。
4. 正本は既存 `readiness.yaml` · `modules.yaml` · Phase1–3 の合成面。新モジュールは増やさない。

## Consequences

- 開発は「有効だが薄い」モジュールを一目で切れる。
- Phase 5（Wire デモ1本化）・Phase 6（Public Web）の前に、閉じた／薄いレーンが可視化される。

## Related

- [0071](0071-executive-tasks-ssot-secretary-workbench.md)
- [0072](0072-property-ops-dashboard.md)
- [0073](0073-executive-home-mal-lanes.md)
