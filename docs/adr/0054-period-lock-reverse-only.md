# ADR 0054: 期間ロックと逆仕訳のみ訂正

## Status

Accepted (2026-08-24)

## Context

`appendJournalEntry` は append-only だが、締め済み期間への起票を拒否するゲートがなかった。

## Decision

1. **`data/finance/period-locks.yaml`** — 月次ロック正本。
2. **`finances close --month` 成功時**（trial + reconcile balanced）に自動ロック。
3. **`appendJournalEntry`** — ロック済み `occurred_at` を拒否。
4. **訂正は `orgos ledger reverse --entry-id` のみ** — 元仕訳を反転する新仕訳。
5. **`orgos ledger period unlock`** — `finance:reconcile` 権限 + 監査ログ。

## Consequences

- 仕訳に `posted_at` / `posted_by` / `reversal_of` を追加。
- `saveJournalEntries` 直接書換は禁止（append のみ）。
- 電子帳簿保存法の法令要件（検索・タイムスタンプ局）は別 ADR / フェーズ。
