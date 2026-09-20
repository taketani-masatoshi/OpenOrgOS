/**
 * ADR 0076 — Public Web 実ユースケース訴求（oorgos.org）
 *
 * - **Status:** Accepted
 * - **Date:** 2026-09-16
 */

## Context

公開 Overview は抽象的な OOO 経路が中心で、MAL の日次（秘書・物件・Wire）が弱かった。
Phase 1–5 で Console 側の導線が揃ったので、対外ページも同じ物語に寄せる。

## Decision

1. **`Web/index.html` に `#usecase` セクション**を追加（hero の下・問題提起の次）。
2. 内容は **Secretary / Property Ops / Wire 一本道** — 実装済み面に限定し、誇張しない。
3. i18n は `overview-i18n.js` の en / ja / zh。ナビに Use case を追加。
4. 実装本体は傘の `Web/`（product）。本 ADR は Core ロードマップの完了記録。

## Consequences

- 公開サイトと Console デモが同じ「朝の一本道」を指す。
- Vercel 本番反映は別デプロイ作業。

## Related

- [0071](0071-executive-tasks-ssot-secretary-workbench.md) … [0075](0075-wire-demo-walkthrough.md)
- `Web/index.html` · `Web/overview-i18n.js`
