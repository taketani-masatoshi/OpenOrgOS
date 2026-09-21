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
| 消費税 | 全仕訳に課税区分があり、課税事業者判定根拠・控除方式を検査する。固定資産等も集計し、取引別インボイス状態・用途区分不足を警告する |

銀行を利用する月の締めは、口座を明示した取込バッチについて、対象月末までの明細、期首残高＋入出金＝期末残高、期末残高＝銀行勘定GLを必須とする。残高を持たない旧形式の明細だけでは締めない。
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

消費税は `orgos tax consumption-filing-draft --fiscal-year FY####` で税率別集計、課税売上割合、仕入控除、経過措置、中間納付、残額を税理士確認用に出力する。インボイス状態が未設定・不明の仕入税額控除は 0 とし、80% 控除は 2023-10-01〜2026-09-30、50% 控除は 2026-10-01〜2029-09-30 の取引だけに認める。期間と区分が矛盾する取引はエラーとする。申告ドラフトでは税率別課税標準の千円未満を切り捨て、国税を標準 7.8%・軽減 6.24%、地方消費税を国税額の 22/78 で分離し、納付となる国税差引額と地方消費税額の百円未満を切り捨てる。出力は `not-for-etax` であり、公式申告書または電子提出データではない。年度末宣言を `settled` とする場合、計算と納付仕訳の差額が 0 でなければ年度決算を拒否する。

課税売上割合、95%全額控除、簡易課税の事業別75%判定は月別結果の合計ではなく申告対象課税期間の全取引を一度集計して判定する。95%全額控除は課税売上高5億円以下も条件とする。免税事業者が期中にインボイス登録した場合は登録効力発生日以後だけを申告対象とする。消費税の納付仕訳は `filing_kind` と `tax_fiscal_year` を必須とし、対象申告年度が一致する仕訳だけを納付済額へ算入する。

税率、国税・地方税比率、申告端数単位、インボイス経過措置期間の正本は `src/lib/finance/consumption-tax-policy.ts` とする。申告ドラフトは `schemas/finance/consumption-tax-filing.ts` で合計関係、端数単位、blocker と状態の整合を検証し、インボイス状態が未設定・不明の取引が1件でもあれば `blocked` とする。

課税仕訳行は `tax_basis: exclusive | inclusive` で税抜・税込を明示できる。省略された既存行は後方互換のため税抜として扱う。証憑上の税額が確定している場合は `tax_amount_yen` を優先する。

中間申告は `prior_period_national_tax_yen` から不要・年1回・年3回・年11回を判定し、`interim_filing_frequency`、対象期間、期限、予定額と、`source.kind=remittance`・`filing_kind=interim` の納付仕訳を照合する。不足、過不足、回数・方式の不一致は申告ドラフトを `blocked` とする。

売上返品・値引き・割戻し・貸倒れ・貸倒回収は仕訳明細の `tax_adjustment` と `original_entry_id` で元取引へ接続する。返品等と貸倒れは売上税額から控除し、貸倒回収は売上税額へ加算する。元仕訳参照がない調整および貸倒れ証憑がない調整はエラーとする。

2割特例は `small_business_relief: two_tenths` を明示し、対象課税期間、インボイス登録、登録前免税、基準期間売上1,000万円以下、課税期間短縮なしをすべて確認できる場合だけ適用する。要件不足時は通常計算へ黙って戻さず、申告ドラフトを `blocked` とする。

簡易課税で複数事業を営む場合は `simplified_multiple_business: true` とし、課税売上行に `simplified_business_type`（`type_1`〜`type_6`）を記録する。未区分売上がある申告下書きはブロックする。`simplified_75_rule: true` の場合、一事業75%または三事業以上における上位二事業75%の特例を事業別売上税額に適用する。

簡易課税を指定する場合は、基準期間課税売上高、制度選択届出書の提出日、適用開始日、国内・国外事業者区分を必須とする。基準期間課税売上高が5,000万円を超える場合、選択の効力が対象課税期間に生じていない場合、または2024-10-01以後に開始する課税期間の初日に国内PEを有しない国外事業者の場合は申告下書きをブロックする。

簡易課税の届出は通常、期中インボイス登録、特例翌期、災害特例の根拠区分と証憑参照を記録する。通常届出は課税期間開始前、特例は明示した期限以前であることを検査する。一括比例配分方式の履歴は `purchase_allocation_history` に保存し、2年経過前の個別対応方式への変更をブロックする。

輸入仕入は `tax_transaction: import` とし、輸入日、輸入申告番号、輸入許可・納付証憑、国税額、地方消費税額を国内仕入れと分けて記録する。必要項目が一つでも欠ける行は控除せず、申告下書きをブロックする。国外事業者から受けた特定課税仕入れは `tax_transaction: reverse_charge` とし、本則課税かつ課税売上割合95%未満の場合だけ売上税額と仕入税額の双方へ反映する。

調整対象固定資産は、取得時と通算の課税売上割合が5ポイント以上かつ50%以上変動し、第三年度末に保有する場合に取得時控除税額を調整する。棚卸資産は課税・免税の移行方向ごとに控除税額を加減する。税抜1,000万円以上の高額特定資産は制限終了年度まで記録し、簡易課税・免税の設定と衝突する場合は申告下書きをブロックする。いずれも根拠証憑参照を必須とする。

年度間調整は `fixed-assets.yaml` の各資産にある `consumption_tax` と `disposed_on`、および `inventory.yaml` の年度末行にある `consumption_tax_adjustment` を正本として自動生成する。取得年度と通算期間の課税売上割合は仕訳の課税売上・輸出免税売上・非課税売上から算出する。`tax-profile.yaml` 内の従来の調整明細は移行互換用とし、同じ資産IDまたは棚卸証憑参照が台帳から生成された場合は二重計上しない。

固定資産に消費税属性がない場合は `consumption_tax_review: not_applicable` の明示がない限り年度間調整を未確認としてブロックする。税務専門家の確認は `recordConsumptionTaxAdvisorReview` を経由し、認証済み操作者の `chat:approve` 権限と `reviewer_ref` の一致を必須とする。証憑SHA-256は参照ファイルから算出し、対象年度、状態、確認者、確認日時、証憑参照、計算SHA-256とともに保存する。同時に承認内容全体のダイジェストをCompany Eventのハッシュチェーンへ追記し、その先端をWitness pinおよび署名可能なProtocol Auditへ固定する。申告ドラフトは計算ハッシュ、監査イベント、チェーン、承認イベントを包含するWitness pinを再検証し、手入力した承認、同年度の重複、証憑不一致、改変後の承認を拒否する。自動テストやAIは実運用テナントの `approved` を生成しない。

法定計算の回帰検証は国税庁の簡易課税複数事業例、中間申告、調整対象固定資産、棚卸資産の各公開資料を固定値テストの根拠とする。根拠URLと照合日は `JP_CONSUMPTION_TAX_POLICY.verified_against` に記録する。この自動照合は税務専門家による個別事実認定・申告レビューを代替しない。

申告ドラフトは税率別課税標準・国税、リバースチャージ、年度間取戻し、売上税額調整、控除税額、端数処理前後、地方消費税、中間納付、最終残額を `filing_workpaper` に分離して保持し、合計不一致をスキーマで拒否する。これは税理士確認用ワークペーパーであり、公式申告書の欄番号を名乗らない。公式申告書XML、電子署名、e-Tax送信および受付結果管理は本モジュールの範囲外であり、申告下書きは `not-for-etax` を維持する。国税庁公開のXML構造・帳票フィールド、電子署名、送受信モジュールに対する適合試験を完了するまで、公式申告データと表示してはならない。

## 税務調整

会計 readiness の完了範囲は、帳簿、月次・年度締め、税理士 handoff の準備までである。100点でも次は完了を意味しない。

- 法人税等の確定仕訳
- 法定申告書の完成
- e-Tax / eLTAXへの提出

地方税ワークペーパーは、配備時の`ORGOS_LOCAL_TAX_CATALOG_PUBLIC_KEY_PEM`で署名検証した税率カタログと原典を用い、明示された法定按分ウェイトで複数事業所を配分できる。欠損金、外形標準課税額、中間納付は根拠資料で確定した入力値として扱い、自動推定しない。eLTAX本番承認はOperator登録簿、`chat:approve`、HumanApprovalContext、Org Approval、Company Eventによる監査先端固定を必須とする。本番transport・公式仕様・接続試験が未登録の間は送信を拒否する。
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
