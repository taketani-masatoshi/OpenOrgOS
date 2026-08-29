# ADR 0046: Tax Obligation Rhythm Engine

**Status:** Accepted · **Date:** 2026-08-24

## Context

税務申告期限は月次（源泉 · 社保）· 年次（法人税 · 法定調書）· 四半期（固定資産税）が混在する。  
`filing_calendar` だけでは CEO 向けキャッシュフロー可視化と rhythm ベース展開が不足していた。

## Decision

1. **`tax-profile.obligation_rhythms[]`** を cadence ベースの SSOT 拡張として採用する（Zod: `obligationRhythmSchema`）。
2. **`buildTaxCalendarPortfolio`**（`src/lib/finance/tax-calendar-portfolio.ts`）が rhythm を展開し、概算金額を付与する。
3. **税額計算は概算に留める** — `rough` / `budget` / `ledger` の 3 段階。法人税確定 · 消費税申告書の自動算定は行わない。
4. **`tax-filing-gaps.yaml`** は operator overlay。engine 自動生成は将来拡張とし、現状は briefing / pulse / `orgos tax gaps` で消費する。
5. **e-Tax 提出禁止** — Agent / Skill / CLI いずれも本番提出 API を持たない。

## Consequences

- 正: 期限と rough outflow を単一 CLI で再現可能
- 正: Finance · Tax Agent 責務をデータパスで分離
- 負: 宿泊税 ledger · canvas ビューは phase4a-thin 統合まで rhythm 固定値で代替
- 負: 全テナントへの `obligation_rhythms` 投入はテナント別（mal 先行）

## Related

- [tax-filing-spec.md](../org-os/tax-filing-spec.md)
- `schemas/finance/tax-profiles.ts`
- `src/lib/finance/tax-calendar-portfolio.ts`
