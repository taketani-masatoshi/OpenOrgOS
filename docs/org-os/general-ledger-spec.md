# 総勘定元帳仕様

**正本:** `data/finance/journal-entries.yaml` · **CLI:** `orgos ledger`

## コマンド

| コマンド | 用途 |
|---------|------|
| `ledger journal list` | 仕訳一覧 |
| `ledger post --file` | 手動起票 |
| `ledger post --source depreciation --month` | 減価償却仕訳 |
| `ledger post --source monthly-pl --month` | 月次 P/L（発生主義 · 売掛/買掛） |
| `ledger post --source remittance --month --obligation` | 源泉・社保・消費税の納付仕訳 |
| `ledger export --template account-breakdown-csv` | 勘定科目内訳明細書 |
| `ledger gl --account` | 科目別元帳 |
| `ledger trial-balance` | 試算表 |
| `ledger monthly-reconcile` | 月次 P/L 突合 |
| `ledger journal backfill-tax` | tax_category バックフィル |
| `ledger journal backfill-audit` | posted_at / posted_by バックフィル（移行） |
| `ledger export` | 仕訳 YAML → CSV ミラー（`records/仕訳一覧.csv`） |
| `ledger export --template trial-balance-csv` | 試算表 → CSV ミラー（`records/試算表.csv`） |
| `skills run journal-export-csv` | 仕訳 CSV（Accounting Agent） |
| `skills run trial-balance-export-csv` | 試算表 CSV（Accounting Agent） |

## 整合

`orgos validate` — 貸借一致 · CoA 未登録科目 · 試算表↔月次差異 · BS 方程式 · 補助元帳統制 · 現金/固資/借入統制 · 期間ロック履歴 · 未計上月は warning（予実差異）

## GL 単一正本（ADR 0053）

実績は `journal-entries.yaml` のみが正本。yojitsu は計画専用。`buildGlMonthlyActuals` / `buildGlProfitLossSummary` が実績導出の唯一入口。

## 追加コマンド（帳簿・締め範囲）

| コマンド | 用途 |
|---------|------|
| `ledger balance-sheet` | 貸借対照表（GL 試算表由来） |
| `ledger subsidiary --account` | 補助元帳（統制勘定） |
| `ledger reverse --entry-id` | 逆仕訳（訂正の唯一経路） |
| `ledger period lock/unlock` | 月次締め後ロック（unlock は理由必須の履歴） |
| `finances close --month` | 自動仕訳のあと統一ゲートを満たせば期間ロック |

## 月次決算ゲート

`orgos finances close --month` と Workbench の month-close checklist（`ready`）は同じ判定（`evaluateMonthlyCloseGates`）を使う。基準日は対象月の末日。

ロックしてよいのは、次が error でないときだけである。

| ゲート | ロック |
|--------|--------|
| 減価償却・給与発生・月次損益（データがある月） | 未計上なら拒否 |
| 試算表・貸借対照表 | 不一致なら拒否 |
| 補助元帳 1150 / 2110 | 統制不一致または未割当残高なら拒否 |
| 銀行明細 | ファイルが無ければスキップ。ファイルがある場合、当月行が1件以上あり未消込が 0 |
| 消費税 | 締め月の収益・費用に課税区分があること。申告書と納付仕訳は作らない |
| `validate` | `data/finance/` の error が 0。モジュール名簿など帳簿外の error と warning はロックしない |
| 銀行明細 | ファイルがあるのに当月行が無い、またはファイルが読めない月はロックしない |
| 月次 YAML 突合 | 計画が無い、または元帳と差がある場合は warning。ロックは妨げない |
| 直前月 | 決算月の最初の月を除き、直前の月がロック済みでないとロックしない |

期間ロック済みかどうかは checklist の `period_locked` であり、`ready` には含めない。ロック済み月の訂正は、理由付き unlock → 同月の逆仕訳 → 再 close。ロックは解除しないまま失敗ゲートを再評価しても、既存ロックは残す。

## 年度決算ゲート

`orgos finances close --fiscal-year FY####` は `closeAccountingYear` を使う。会計年度は会社の決算月であり、予実の `period_to` では縮めない。

通るのは、次がすべて真のときだけである。

- 年度の各月が月次ゲートを満たし、かつロック済みである
- 損益振替 `JE-CLOSE-FY####-PL-TRANSFER` を期末日に1本だけ追記できる。この振替だけはロック済み期末月への追記を許す。通常仕訳は拒否したまま
- 成功したときだけ、生きている `opening-balances.yaml` を翌期の開始残高へ切り替える。提案ファイルは残してよいが、試算表が読む正本は本番ファイルだけ
- ゲートを満たさないときは振替も本番の開始残高も書かない。再実行は同じ振替を足さない
- 月次ロック時に仕訳・銀行突合・試算表・ゲート結果の SHA-256 を保存する。年度決算は可変な計画・銀行ファイルを再判定せず、ロック時証跡と月次仕訳の不変性を検証する
- 年度決算は `annual-close.FY####.state.yaml` に `prepared → validated → committing → committed` を記録し、異常終了後の再実行で同じ処理を再開する。各 YAML は一時ファイルから原子的に置換する

法人税等の計上、申告、利益処分は年度決算の条件にしない。

## 税務調整

会計 readiness の完了範囲は、帳簿、月次・年度締め、税理士 handoff の準備までである。100点でも次は完了を意味しない。

- 法人税等の確定仕訳
- 法定申告書の完成
- e-Tax / eLTAXへの提出
- 税理士または代表者による最終確認・署名

`evaluateTaxAdjustment` は別表四相当のワークシートだけを返す。仕訳は切らない。開始残高の切替もしない。

起点は損益振替前の当期純利益である。振替仕訳があるときは、その利益剰余金行から復元し、振替後の 0 は使わない。自動加算は、資産に書いた税務償却額を超える帳簿償却と、`tax-profile` に書いた交際費科目が上限を超えた差額だけである。それ以外は `data/finance/tax-adjustments.yaml` の明示行。課税所得が計算できないときは、別表四に加算 0 と当期純利益の写しを出さない。e-Tax は対象外。

## 期間ロック（Console 前提）

CLI と同じ lib（`src/lib/finance/period-lock.ts`）を Console の予実ワークベンチが呼ぶ。

| 面 | 経路 |
|---|---|
| Console | 予実 → 元帳ワークベンチ → 「期間ロック（CL 必須）」/「ロック解除」（理由入力が必須） |
| CLI | `orgos ledger period lock/unlock --reason` |
| BFF | `POST /chat/v1/ledger/period`（`finance:reconcile`） |

- unlock は理由が空だと 422。理由は `period-locks.yaml` の履歴と `chat-audit.jsonl`（`ledger_period_lock` / `ledger_period_unlock`）の両方に残る。
- **ロックは会社イベントを発行しない。** 会社イベント（`docs/company/events/`）は対外的な事実の台帳であり、内部の締め操作は期間ロック履歴と監査ログで十分な証跡になる。二重台帳を避けるため発行しない。

## 監査証跡

仕訳に `posted_at` · `posted_by` · `reversal_of` · 行 `counterparty_id`。vitest は `tenants/_fixture-books` のみ書込可。
