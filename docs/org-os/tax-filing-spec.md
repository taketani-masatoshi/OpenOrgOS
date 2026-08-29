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
orgos tax handoff [--fy FY2026]
orgos ledger export --template account-breakdown-csv
orgos tax gap resolve --id <gap-id> --status resolved --notes "税理士確認 YYYY-MM-DD"
orgos skills run tax-filing-prep
orgos validate
```

`orgos tax readiness` は **agent-readiness とは別指標**（7 軸 · 申告準備の実務深度）。e-Tax / 申告書 XML は分母外。  
**`advisor_pending`**（deferred · tax_advisor）を併記 — 機械 100% でも税理士回答待ちなら `filing_ready: false`。

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
| 5c | e-Tax / eLTAX 本番提出 | **スコープ外**（人間/税理士） |
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
