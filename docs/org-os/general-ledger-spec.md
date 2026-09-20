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

## 追加コマンド（経理100点）

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
| 銀行明細 | ファイルがある月だけ、その月の未消込が 0。ファイルが無ければスキップ |
| 消費税 | 集計が返ること。納付仕訳と申告は条件にしない |
| `validate` | `data/finance/` の error が 0。モジュール名簿など帳簿外の error と warning はロックしない |
| 月次 YAML 突合 | **警告のみ。ロックしない理由にしない** |

期間ロック済みかどうかは checklist の `period_locked` であり、`ready` には含めない。ロック済み月の訂正は、理由付き unlock → 同月の逆仕訳 → 再 close。ロックは解除しないまま失敗ゲートを再評価しても、既存ロックは残す。

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
