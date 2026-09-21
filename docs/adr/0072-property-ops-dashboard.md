/**
 * ADR 0072 — Property Operations Dashboard（物件運営ダッシュボード）
 *
 * - **Status:** Accepted
 * - **Date:** 2026-09-16
 */

## Context

MAL の実体は番町（賃貸 PROP-001）と亀沢旅館（hospitality PROP-002）である。
`/stays/` は ops-due の薄い面に留まり、保険・許可・掲示・収支・名簿が散在していた。
Secretary Workbench（ADR 0071）の次に、物件別の日次運用面が必要になった。

## Decision

1. **`GET /chat/v1/properties/ops`**（`chat:read`）で物件カードを合成する。
2. **UI は `/properties/`** — `PropertyOpsPage`。`StaysPage` は宿泊期限の薄い面として残す。
3. **正本は既存 YAML** — properties · insurance · permit-registry · stays · rent-roll ·
   facility public · guest-register validate。新規テナントデータ正本は増やさない。
4. **L1 のみ** — 宿泊者氏名・secrets・証券番号・許可証 PDF 本文は出さない。
   名簿は件数と指摘件数のみ。
5. **物件スコープ** は `modules.yaml` の `property_ids`。ops-due は stay.property_id で enrich。

## Consequences

- Console から物件ハブへ辿れる（Stays / Secretary Workbench からリンク）。
- 保険 YAML が空のときは「未登録」と明示する（捏造しない）。
- Phase 3 以降で Executive Home への要約配線が可能。

## Related

- [0071](0071-executive-tasks-ssot-secretary-workbench.md) — Secretary Workbench
- [0065](0065-executive-home-console.md) — Executive Home
