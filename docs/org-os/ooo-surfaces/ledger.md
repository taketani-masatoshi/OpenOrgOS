# 金銭と帳簿の面（OOO-09〜OOO-14）

**実装:** `src/lib/steward-chat/routes/ledger-api.ts` · `src/lib/steward-chat/routes/broker-api.ts`
**採点:** `docs/org-os/ooo-capability-items.yaml` の OOO-09〜OOO-14

会社の金と帳簿に触る面。ここは取り消しの効かない操作が集まるので、
**誰が呼べるか**と**何を拒むか**を経路ごとに固定する。

## 経路と必要権限

| 経路 | 権限 | 変更 |
|---|---|---|
| `GET /chat/v1/ledger/workbench` | `chat:read` | 読み取り |
| `GET /chat/v1/ledger/export` | `chat:read` | 読み取り（CSV） |
| `GET /chat/v1/ledger/dencho/search` | `chat:read` | 読み取り |
| `POST /chat/v1/ledger/post` | `finance:reconcile` | 仕訳の追記 |
| `POST /chat/v1/ledger/reverse` | `finance:reconcile` | 逆仕訳の追記 |
| `POST /chat/v1/ledger/period` | `finance:reconcile` | 月次 lock / unlock |
| `GET /chat/v1/ledger/bank-csv-template` | `chat:read` | 取込用 CSV の様式 |
| `POST /chat/v1/ledger/bank-statements/import` | `finance:reconcile` | 銀行 CSV 取込 |
| `POST /chat/v1/ledger/bank-reconcile` | `finance:reconcile` | 消込 |
| `POST /chat/v1/broker/transfer` | `broker:transfer` | 振込指示の生成 |
| `GET /chat/v1/broker/accounts` | `chat:read` | 口座一覧（マスク済み） |

読み取りは `chat:read`、帳簿を動かすものは `finance:reconcile`、金を動かすものは
`broker:transfer`。権限が無ければ 403 で、経路の存在自体は隠さない。

## 拒否する条件

| 状況 | 応答 |
|---|---|
| セッションが無い | 401 `unauthorized` |
| 権限が無い | 403 `forbidden`（`permission` を添える） |
| 記帳の月が無い・書式違い | 422 `month YYYY-MM is required` |
| 逆仕訳に元仕訳が無い | 422 `entry_id is required` |
| 理由なしの unlock | 422 `reason is required to unlock` |
| `action` が lock / unlock 以外 | 422 `action must be lock \| unlock` |
| 締めた月への記帳 | 422（`period-locks.yaml` が拒む） |
| tier B/C 金額の実振込に承認が無い | 422 `approval_id（Settlement PassKey 済み）が必要です` |
| 承認が未承認・金額不足 | 400 `未承認です` / `金額が振込額をカバーしていません` |
| 想定外の例外 | catch して 400 / 422 の JSON。プロセスは落とさない |

## 帳簿の真実性

- 仕訳は追記のみ。既存仕訳を書き換える口は BFF・CLI とも持たない
- 訂正は逆仕訳だけ。逆仕訳は `reversal_of` で元仕訳を指す（[ADR 0054](../adr/0054-period-lock-reverse-only.md)）
- 締めた月は `POST /chat/v1/ledger/period` の unlock に**理由**が要る。理由は監査へ残る
- 検索要件の詳細は [電子帳簿の検索](../electronic-ledger-search.md)

## 口座番号の扱い

`GET /chat/v1/broker/accounts` は `account_number_display` を `****` に潰した
redacted view しか返さない。振込指示の応答も `from_number_redacted` だけを載せ、
**口座番号そのものを HTTP・チャット・監査ログのいずれにも書かない**（L2）。
実際の番号は gitignore 下のマスタに置き、`bank_account_id` で参照する。

## やらないこと

- 全銀 API への直結。生成するのは指示ファイルまでで、送信は人間の銀行操作
- 仕訳の物理削除。誤りは逆仕訳のみで表現する
- 締め済み月の遡及修正を「無かったこと」にする経路

## テスト

| 層 | パス |
|---|---|
| 単体 | `tests/electronic-ledger.test.ts` · `tests/period-lock-invoice-dedupe.test.ts` · `tests/journal-write-guard.test.ts` |
| HTTP | `tests/steward-chat-ledger-http.test.ts` · `tests/steward-chat-broker-http.test.ts` |
| E2E | `e2e/steward-chat.books.spec.ts` · `e2e/steward-chat.money.spec.ts` |
