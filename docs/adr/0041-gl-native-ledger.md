# ADR 0041: OrgOS ネイティブ総勘定元帳（GL）

## Status

Accepted · 2026-08-24

## Context

経費精算のみの限定仕訳から、決定論の複式簿記 GL を正本に持つ経理基盤へ移行する。

## Decision

- `data/finance/journal-entries.yaml` を append-only 正本とする
- 総勘定元帳・試算表・月次突合は `src/lib/finance/ledger/` で自前実装
- 経営用 `monthly/*.yaml` は残し、試算表との突合で整合を機械検証

## Consequences

- 申告書生成は範囲外（集計パッケージまで）
- 移行期間は yojitsu と GL の二重管理 — `orgos ledger monthly-reconcile` で差異検出
