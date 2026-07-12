# JP 法人口座・資金繰り表仕様（jp_bank_corporate）

**版:** 1.1 · **日付:** 2026-07-12
**モジュール:** `steward/jurisdiction-packs/JP/modules/jp_bank_corporate/`
**スキーマ:** `schemas/jp-bank-corporate.ts`

---

## 1. 目的

会計ソフト並みの **日次 / 週次 / 月次** 資金繰り表を CLI で決定論生成し、Accounting / Treasury Agent から参照する。

## 2. 正データ

| ファイル | 用途 |
|----------|------|
| `data/finance/cash-balance.yaml` | 期首現預金（口座別 · confirmed 必須） |
| `data/finance/payment-calendar.yaml` | 日付固定支払（給与 · 税 · 設備投資 · 借入） |
| `data/finance/ar-ap-ledger.yaml` | 売掛・買掛エントリ |
| `data/finance/collection-terms.yaml` | 回収・支払サイト既定 |
| `data/finance/monthly/{YYYY-MM}.yaml` | 月次実績 |
| `data/plans/yojitsu-fy*.yaml` | 予実（capex 含む） |
| `data/plans/debt-plan.yaml` | 借入返済スケジュール |
| `data/finance/payroll.yaml` | 給与支払 |
| `data/finance/fixed-costs.yaml` | 固定費 |
| `data/finance/tax-profile.yaml` | 税務区分 |
| `data/finance/bank-statements.yaml` | 銀行 CSV 取込 actual（`orgos jp bank statement import`） |
| `data/finance/reconciliation-events.yaml` | append-only 消込・取消イベント |

### 2.1 P0 / P1 の正本と排他

- **P0（生成）:** 資金繰り計算は上表の正データを読み、`docs/finance/treasury/cashflow-schedule/` だけを生成物正本とする。旧 `docs/plans/cashflow-detail.md` は参照用であり入力に戻さない。
- **P1（取込）:** `calendar import` は正データから `payment-calendar.yaml` へ、`ar-ap sync --from invoices` は生成済み請求成果物と billing 設定から `ar-ap-ledger.yaml` へ取り込む。
- 同一 ID は追記しない。payment calendar / AR-AP の明示行を自動生成 fallback より優先し、同一キャッシュフローを重複計上しない。
- `cash-balance.as_of` は当日営業終了時残高。予測 horizon は原則翌日開始とし、`as_of` 以前の銀行実績を残高へ再加算しない。
- AR/AP の現在残額・状態は基準 `paid_amount` と有効な reconciliation event を replay して導出する。

### 2.2 import 規則

- 金額・期日・口座 ID は既存データから解決する。未定義値を固定額や `BANK-001` で補わず、0 件と警告にする。
- `--fy FYyyyy` / `--month YYYY-MM` を指定可能。未指定 FY は対象月を含む予実データから決定する。
- `days_after_booking` は計上日後の暦日数。`days_after_month_end` は計上月の最終暦日の N 日後（0 は当月末）で、指定時はこちらを優先する。
- invoice 同期 ID は invoice number と billing の module / property / FY / month 由来で安定化し、再実行しても同一行を増やさない。
- invoice billing は `collection_term_id` を必須とし、期日は collection term の pure resolver から算出する。
- 銀行 entry / batch ID は canonical SHA-256 fingerprint 由来。同一内容の再取込は 0 件、同一 ID の内容差異は error。
- calendar import、AR/AP sync、builder/export は同じ pure resolver で `category` を `chart_account_id` に解決する。入力に明示値があれば優先し、未解決は推測せず warning とする。`BANK-*` は銀行口座 ID であり勘定科目コードとして扱わない。

## 3. 出力

| 種別 | パス |
|------|------|
| 生成レポート | `docs/finance/treasury/cashflow-schedule/{date}-{granularity}.md` |
| CSV | 同上 `.csv` |
| 明細 CSV | 同上 `-detail.csv`（rollup 行ごとの `detail_line_ids` / 明細行） |
| Agent 要約 | `docs/reports/agent-summaries/accounting/` · `treasury/` |

`orgos pipeline daily` 実行時に exact-reference 消込後、weekly JSON/MD と
weekly detail CSV を自動再生成する。Steward Chat Today は 7 日超、入力
fingerprint 変更、tie-out 失敗のいずれかを `stale` として L1 表示する。

## 4. CLI

```bash
orgos jp bank cashflow generate --granularity weekly --horizon 13w --format md
orgos jp bank position show --as-of YYYY-MM-DD
orgos jp bank calendar validate
orgos jp bank calendar import --from payroll|tax|yojitsu|contracts
orgos jp bank ar-ap list|validate|sync --from invoices
orgos jp bank ar-ap aging --as-of YYYY-MM-DD
orgos jp bank statement import --file path/to/bank.csv [--write]
orgos jp bank statement tie-out
orgos jp bank reconcile propose|auto|list
orgos jp bank reconcile apply --bank-id ... --ar-ap-id ... --amount ... --reason ...
orgos jp bank reconcile reverse --event-id ... --reason ...
orgos jp bank cashflow export --template cash-book-csv
orgos jp bank cashflow export --template mizuho-weekly
orgos jp bank cashflow export --template tax-payment-csv
```

export は Zod 検証済み seed template の `columns`、`delimiter`、`source` に従う。
`mizuho-weekly` は銀行提出向けの週次集約、`tax-payment-csv` は tax profile /
payment calendar から金額を取得できる税支払だけを出力する。いずれも実口座番号を
扱わず `bank_account_id` のみを使用する。

### 4.1 消込ルール

- `reference` が AR/AP ID または invoice ID に一意一致し、方向・口座・通貨・残額制約を満たす場合だけ自動確定する。部分額も許可する。
- 金額・日付だけの一致は候補に留め、自動確定しない。
- 過入金・過払い残額は bank statement の `unapplied_amount` として保持し、synthetic AR/AP を生成しない。
- manual apply / reverse は `finance:reconcile` permission を持つ `ceo` / `approver` のみ。
- 訂正は既存 event を変更せず、`reconciliation.reversed` を追記する。

## 5. 行スキーマ

| 列 | 内容 |
|----|------|
| period_key | 日次 YYYY-MM-DD / 週次 YYYY-Www / 月次 YYYY-MM |
| direction | inflow / outflow / transfer |
| category | 売上入金 · 給与 · 消費税 · 設備投資 等 |
| account_id | `BANK-xxx` のみ（L2 口座番号禁止） |
| planned / actual / forecast | 3 列（Phase 2 以降 forecast 列を yojitsu 連動） |
| balance_total | 合計残高 |
| source | actual / planned / ar-ap / import / tax-calendar / payment-calendar |

schedule の `shortfall_amount` は最初に負残高となった時点の残高を保持する。
`required_funding_amount` は期間内最小残高から `max(0, -minimum)` で算出し、
`required_funding_by_date` はその最小残高への最初の到達日を保持する。

## 6. チャット連携（Agent 正本）

| ユーザー意図 | CLI |
|-------------|-----|
| 資金繰り表を出して | `orgos jp bank cashflow generate --granularity weekly --write` |
| キャッシュポジション | `orgos jp bank position show` |
| 来週の支払い | `orgos jp bank calendar validate` + 最新 schedule |
| 資金ショート | schedule の `shortfall_date` 参照 |

## 7. 禁止

- 口座番号・支店コードの tracked 出力（`bank_account_id` リンクのみ）
- 振込実行の自動決定
- 消込 event の更新・削除
- 金額・相手先の類似だけによる自動消込

## 8. テスト境界

`tests/fixtures/jp-bank-corporate/` の架空テナントを正とする。catalog/unit/
integration test は `mal`、`demo`、gitignore invoice output を参照しない。
総勘定元帳、決算整理、会計期間ロック、銀行 API は本モジュールの対象外。

## 9. 関連

- Skill: `steward/jurisdiction-packs/JP/modules/jp_bank_corporate/skills/jp_cashflow_schedule.md`
- Agent: `steward/core/agents/accounting_agent.md` · `treasury_agent.md`
