# ADR 0042: 消費税仕訳行モデル

## Status

Accepted · 2026-08-24

## Decision

- 仕訳行に `tax_category` / `tax_rate_pct` を付与
- 経過措置は `transitional_deduction_rate_pct`（80/50）で控除
- `orgos ledger journal backfill-tax` で既存仕訳を CoA 既定値で補完

## Out of scope

- e-Tax / eLTAX 本番提出（ADR 0052 の 5c）。提出用 XML の出力は 5b
