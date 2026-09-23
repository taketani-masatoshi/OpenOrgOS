# Tax Filing Spec — OrgOS 税務申告準備

**Status:** Active · **Jurisdiction:** JP (primary) · **Agent:** Tax (`steward/core/agents/tax_agent.md`)

## 目的

法人の **申告準備**（正データ整備 · 期限可視化 · 税理士引き渡し）を決定論 CLI + YAML 正本で支える。  
**e-Tax / eLTAX への本番提出はスコープ外**（税理士 · 代表の権限）。

## 責務境界

| 主体 | 責務 |
|------|------|
| **Tax Agent** | `docs/company/tax/**` · 申告ドラフト · チェックリスト生成 |
| **Finance Agent** | 数値 SoT（GL · 月次 · 固定資産 YAML） |
| **Accounting** | 仕訳 · 総勘定元帳（`orgos ledger` · ADR 0041 ネイティブ GL） |
| **Compliance** | インボイス制度 · 規程整合 |
| **人間 / 税理士** | 区分確定 · 申告書 XML · 電子署名 |

## データ正本

| ファイル | スキーマ | 必須 |
|----------|----------|------|
| `data/finance/tax-profile.yaml` | `schemas/finance/tax-profiles.ts` | はい |
| `data/finance/fixed-assets.yaml` | `schemas/finance/balance-assets.ts` | 申告期 |
| `data/finance/tax-filing-gaps.yaml` | `schemas/finance/tax-filing-gaps.ts` | 任意 overlay |

## obligation_rhythms 展開規則

`tax-profile.obligation_rhythms[]` が存在する場合、`filing_calendar` より **rhythm を優先**して期限行を展開する。

| due_rule | 意味 |
|----------|------|
| `next_month_day_10` | 毎月 · 翌月10日（源泉等） |
| `end_of_month` | 毎月末（社保 · 宿泊税 rhythm） |
| `fixed_md` | 年次固定月日（年末調整 · 法定調書） |
| `custom_mds` | 複数固定月日（固定資産税 4 期） |
| `fiscal_plus_2_months` | 決算日 +2 ヶ月（法人税確定） |

個人事業（`entity_form: sole_proprietorship`）の青色申告決算書（一般用）と所得税は別表四を使わない。行の正本は `jp_tax_individual` の `blue-return-line-map`。複式で貸借と損益が揃えば青色申告特別控除は 55 万円を所得から引く。e-Tax の提出日または優良な電子帳簿の届出日があるときだけ 65 万円。決算書の元入金は期首で、当年の所得とは別行。出力は `submission: not-for-etax` の顧問ドラフトで、送信はしない。

`apply_when` で payroll / 固定資産 / 消費税課税 / 還付 CLAIM（`has_open_consumption_refund`）の有無をフィルタ。

## 金額推定（3 段階）

| confidence | 意味 | 例 |
|------------|------|-----|
| `rough` | 式・固定概算 | 源泉 10% · 社保 15% |
| `budget` | tax-profile / yojitsu 静的見積 | `estimated_tax_fy2026` |
| `ledger` | 台帳連携 | 消費税還付 CLAIM（`consumption_refund_open`）· 宿泊税 ledger（将来） |

税理士確定額の **上書き禁止**。差異は warning のみ。

## CLI

```bash
orgos tax calendar [--today YYYY-MM-DD]
orgos tax gaps
orgos tax consumption-check
orgos tax depreciation
orgos tax invoice-registration
orgos tax invoice-issue-check
orgos tax readiness
orgos tax filing-score [--json]
orgos tax record-official-receipt --item <id> --number <digits> --endpoint <url> --i-recorded-from-official-site
orgos tax handoff [--fy FY2026]
orgos ledger export --template account-breakdown-csv
orgos tax gap resolve --id <gap-id> --status resolved --notes "税理士確認 YYYY-MM-DD"
orgos skills run tax-filing-prep
orgos validate
```

`orgos tax readiness` は **agent-readiness とは別指標**（7 軸 · 申告準備の実務深度）。e-Tax / 申告書 XML は分母外。  
**`advisor_pending`**（deferred · tax_advisor）を併記 — 機械 100% でも税理士回答待ちなら `filing_ready: false`。

### e-Tax / eLTAX — 製品ゲートと法定充足の切り分け

| 層 | やること | やらないこと |
|----|----------|--------------|
| **製品（完成）** | 送信拒否 · fixture XSD 拒否 · 秘密鍵非ログ · `filing-score` で 0 点表示 · 使い捨て gitignore ツリーでの採点試験 | 政府へソケットを開く · ダミー申告 · tip への偽受付 |
| **法定照合の充足** | 人間が公式サイトで出した **実** 受付を `record-official-receipt` で gitignore へ残す | テスト桁でキャンバスを充足にする |

- ソケットは開かない（`attemptOfficialFiling` / `submitOfficialReturnXml`）。
- 採点は `records/finance/official-filing-receipt.yaml`（gitignore）の数字形だけ。tracked 見本は 0。
- ユニット試験は **使い捨て gitignore** ルートで拒否と採点分岐だけを証明する。本番ワークスペースに受付を書かない。
- ダミーの税務申告で点数を取ることは禁止。年次の実提出後だけ記録する。

## 固定資産 · 当期計上

| フィールド | 意味 |
|-----------|------|
| `annual_depreciation` | 定額法の年間償却額（`floor(取得原価/耐用年数)`） |
| `fy_depreciation_jpy` | **当期末に P/L 計上する額**（未供用は `0`） |
| `placed_in_service_month` | 供用開始月 — スケジュール展開の下限 |

`fy_depreciation_jpy: 0` は `expense_plan_line_id` なしで許容（第10期供用開始など）。

## インボイス skill

| Skill | 正本関数 |
|-------|---------|
| `jp_invoice_registration` | `assessInvoiceRegistration` |
| `jp_qualified_invoice_issue` | `assessQualifiedInvoiceIssuance` |

免税 × `invoice_registered: true` は `invoice_exempt_reconciled_basis` 未記録で warning。T 番号は `^T\d{13}$`。

## 生成物

| 出力 | パス |
|------|------|
| 申告チェックリスト | `docs/finance/tax-filing-checklist.md` |
| 固定資産台帳（人向け） | `docs/finance/fixed-asset-register.md` |
| Agent 要約 | `docs/reports/agent-summaries/tax/` |

## 将来接続（Phase 5 — ADR 0052）

| サブ | 内容 | 状態 |
|------|------|------|
| 5a | 会計 SoT（試算表 · 月次整合） | Phase 3 進行中 |
| 5b | 申告書 XML / 別表ドラフト | defer |
| 5c | e-Tax / eLTAX 本番提出 | **法定は未充足** — 製品ゲートは完成（ソケット非開通 · 人間記録口 · 使い捨て gitignore 試験）。実受付が無い間は score 0 |
| 5d | 宿泊税 `mode: from_ledger` | defer · 設計 stub ADR 0052 |

```yaml
# 5d 将来 — obligation_rhythms
amount:
  mode: from_ledger
  ledger_ref: data/operations/lodging-tax.yaml
```

- `src/lib/canvas-views/builders/finance-tax-calendar.ts` — CEO ボード
- `src/lib/hospitality/store.ts` — 宿泊税 ledger 連携

## 関連

- [consumption-tax-refund-spec.md](./consumption-tax-refund-spec.md) — 還付は集計と手続を分離（ADR 0056）。R0–R3 実装済み。e-Tax はしない
- [jp-bank-corporate-cashflow-spec.md](./jp-bank-corporate-cashflow-spec.md) — `calendar import --from tax`
- [expense-claim-spec.md](./expense-claim-spec.md) — 適格請求書 QR
- ADR [0046-tax-obligation-rhythm-engine.md](../adr/0046-tax-obligation-rhythm-engine.md)
- ADR [0051-jp-tax-skills-cli-only.md](../adr/0051-jp-tax-skills-cli-only.md)
- ADR [0052-tax-filing-phase5-deferred.md](../adr/0052-tax-filing-phase5-deferred.md)

## e-Tax / eLTAX 製品ゲート（統合）

製品は **申告準備・投影行・差分照合** まで。政府ソケットは開かない。

| 項目 | 製品の扱い |
|------|------------|
| `orgos tax filing-score` | tip では全 0。実受付番号は gitignore パスのみ |
| `record-official-receipt` | 人間 + `--i-recorded-from-official-site` 必須。LLM / MCP / agent は拒否 |
| Steward Chat `/tax/lines-read` | 読取専用。送信ボタンなし。`submission: not-for-etax` |
| 実 XSD | オペレータが `ORGOS_OFFICIAL_XSD_PATH` でローカル供給したときだけ。`tests/fixtures` は常に拒否。CI 必須にしない・公式 XSD を repo に置かない |
| 法定キャンバスの e-Tax / eLTAX / 決算書円 | 製品ゲート完成では `met` にしない（円・受付は製品外） |

実装: `src/lib/finance/filing/official-receipt.ts` · `src/lib/product/tax-lines-read-model.ts`

## 実装到達度（開発完了軸）

開発完了の判定は **コード＋開発 fixture＋試験通過**。公的実データ・gitignore 実受付・公式 XSD のマシン配置は運用／法定キャンバス側。

| 項目 | 満点条件（開発） |
|------|------------------|
| 会社計算規則 | 条例見出し一致＋開発 fixture 円の空差分（acceptance） |
| 提出ゲート | tip filing-score 全0・confirm 拒否・LLM 拒否の試験 |
| XSD 経路 | fixture 拒否＋オペレータ一時パスの xmllint 試験（repo 非同梱） |
| tip | 製品ツリー git 追跡＋対象試験 green＋PR（main 強制マージ不要） |
| pin_diff | 製品ピン／ライブ照合の空差分 |
| e2e | handoff→form pin→score0→confirm→LLM→local XSD の鎖 |

掲示: `accounting-tax-impl-score-100.canvas.tsx`（開発完了）。  
法定: `accounting-tax-close-readiness-hard.canvas.tsx`（公式円・実受付は別管理）。

### 公式 XSD オペレータ手順（運用）

1. e-Tax / eLTAX から当該申告の公式 XSD をダウンロードする。
2. リポジトリ外に置く（`tests/fixtures` 配下は拒否）。
3. `export ORGOS_OFFICIAL_XSD_PATH=/absolute/path/to/official.xsd`
4. `xmllint --noout --schema "$ORGOS_OFFICIAL_XSD_PATH" draft.xml`
