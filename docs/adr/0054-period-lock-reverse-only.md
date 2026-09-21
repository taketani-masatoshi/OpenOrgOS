# ADR 0054: 期間ロックと逆仕訳のみ訂正

## Status

Accepted (2026-08-24)

## Context

`appendJournalEntry` は append-only だが、締め済み期間への起票を拒否するゲートがなかった。

## Decision

1. **`data/finance/period-locks.yaml`** — 月次ロック正本。
2. **`finances close --month` は統一ゲート通過時に自動ロックする。** 試算表・貸借対照表・補助元帳統制・`data/finance/` の validate error 0・必要な自動仕訳（減価償却・給与発生・月次損益）が揃っていること。`bank-account.yaml` で `status: none` 以外（active）のときは `bank-statements.yaml` が必要で未消込 0。`status: none` のときだけ銀行ゲートをスキップする。`monthly/{YYYY-MM}.yaml` がある月は突合不一致でロックを止め、無い月だけ「plan not imported」を warning とする。
3. **`appendJournalEntry`** — ロック済み `occurred_at` を拒否。
4. **訂正は逆仕訳の append のみ** — 元仕訳は残す。ロック済み月へは append できないので、先に理由付き unlock し、同月日付の逆仕訳を書いてから再ロックする。
5. **`orgos ledger period unlock`** — `finance:reconcile` 権限 + 監査ログ。

## Consequences

- 仕訳に `posted_at` / `posted_by` / `reversal_of` を追加。
- `saveJournalEntries` 直接書換は禁止（append のみ）。
- ロック済み月への起票（通常仕訳も逆仕訳の append も）は拒否する。訂正は `orgos ledger period unlock --reason` のあと、同月の逆仕訳を append し、ゲートを満たして再ロックする。
- 電子帳簿保存法の法令要件（検索・タイムスタンプ局）は別 ADR / フェーズ。
