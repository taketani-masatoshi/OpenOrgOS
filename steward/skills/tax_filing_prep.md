# Skill: tax_filing_prep（税務申告準備）

## 目的

決算期（1月決算）の **法人税・消費税・地方税** 申告に必要な正データを整備し、税理士への引き渡しパッケージを揃える。

## 入力

- `data/finance/fixed-assets.yaml` — 固定資産台帳
- `data/finance/tax-profile.yaml` — 税務区分・期限
- `data/finance/chart-of-accounts.yaml` — 勘定科目
- `data/finance/cash-balance.yaml` — 期末現預金（TBD 可）
- `data/finance/loans.yaml` — 役員貸付
- `data/finance/payroll.yaml` — 役員報酬
- `data/plans/expense-plan.yaml` · `profit-plan.yaml` · `yojitsu-fy2026.yaml`
- `docs/company/tax/fy2026/` — 申告ドラフト群

## 出力

- 更新済 正データ YAML（上記）
- `docs/finance/tax-filing-checklist.md` — 申告チェックリスト
- `docs/finance/fixed-asset-register.md` — 人向け固定資産台帳
- `docs/reports/agent-summaries/finance/{YYYY-MM-DD}-tax-prep.md`

## 使用 Agent

Finance Agent（Compliance Agent と申告期限・区分を照合）

## 保存先

| 種別 | パス |
|------|------|
| 正データ | `data/finance/fixed-assets.yaml` 等 |
| 人向け | `docs/finance/` |
| 要約 | `docs/reports/agent-summaries/finance/` |

## 手順

1. `npm run validate` — fixed-assets ↔ expense-plan 整合確認
2. `npm run steward -- deps check --file data/finance/fixed-assets.yaml`
3. TBD 項目（現預金・資本金・消費税区分）を tax-profile に明示
4. 税理士チェックリストと照合（`docs/company/fy2026-tax-advisor-checklist.md`）
5. 確定後 `npm run steward -- report kessan`（任意）

## 禁止

- 未確認の銀行残高・登記情報の捏造
- e-Tax / eLTAX への本番提出（税理士・代表の権限）
- 消費税区分の独断確定
