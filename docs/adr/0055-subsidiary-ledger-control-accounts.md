# ADR 0055: 補助元帳と統制勘定

## Status

Accepted (2026-08-24)

## Context

売掛金（1150）等の統制勘定残高を取引先別に追跡する補助元帳がなかった。

## Decision

1. 仕訳行に **`counterparty_id`** を追加（`org_unit_id` / `person_id` と同列）。
2. **`orgos ledger subsidiary --account <code>`** — 取引先別残高・滞留日数。
3. **固定資産** — `fixed-assets.yaml` + 償却仕訳から台帳行を生成。
4. **`orgos validate`** — 統制勘定 = 補助元帳合計（未割当残高は error）。

## Consequences

- AR 入金仕訳は `counterparty_id` 付与を推奨。
- 買掛金・その他統制勘定は同 API で拡張可能。
