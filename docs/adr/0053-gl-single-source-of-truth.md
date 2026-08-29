# ADR 0053: GL 単一正本化と yojitsu 降格

## Status

Accepted (2026-08-24)

## Context

経理モジュールは yojitsu（予実）と GL（journal-entries.yaml）の二重管理期間にあった。
`report kessan --compare` は移行差異の可視化に使われていたが、プロダクトとして GL を単一正本にする必要がある。

## Decision

1. **実績の正本は GL** — `journal-entries.yaml` から導出する。
2. **yojitsu は計画専用** — `months[].plan` と `summary` は計画値。`actual` は読取互換のみ（deprecated）。
3. **`closing.basis` 既定は `gl`** — レガシー `actual` / `forecast` は deprecated。
4. **実績導出の唯一入口** — `buildGlMonthlyActuals(fiscalYear)` / `buildGlProfitLossSummary`.
5. **`--compare` は予実差異** — plan（yojitsu）vs GL actual。

## Consequences

- `variance.ts` · dashboard · finance-briefing · report は GL 由来へ付け替え。
- mal 等の既存 yojitsu `summary` 実績値は計画メモとして残るが権威を持たない。
- 申告書 XML / e-Tax 提出は引き続きスコープ外（ADR 0052）。
