# 支出計上 確認質問 — 令和7年分

金額: 150,000 円 · 帯: **from_100k_to_200k**
complete: **いいえ**

## 確認質問

1. **business_use** — この支出は事業専用ですか、家事共用ですか？
   - hint: `business_only | shared`
2. **depreciation_choice** — 取得価額帯は from_100k_to_200k です。減価償却・費用化の選択は？
   - hint: `候補: lump_sum | ordinary_fixed_asset`
3. **occurred_on** — 費用の発生日（取引日）はいつですか？（YYYY-MM-DD）
4. **paid_on** — 支払日はいつですか？（YYYY-MM-DD）
5. **expense_line** — 青色申告決算書の経費区分（または account_code 4桁）はどれですか？
6. **evidence_refs** — 証憑（領収書・請求書パス等）はありますか？ evidence_refs に列挙してください。
7. **invoice_qualified** — 適格請求書（インボイス）に該当しますか？（true/false）
8. **withholding_applicable** — 源泉徴収の対象ですか？（報酬・料金等）
9. **bundle_or_split_purchase** — 同一資産の分割購入・セット購入の可能性がありますか？（特例判定用・true/false）
10. **repair_vs_capex** — 修繕費ですか、資本的支出ですか？
   - hint: `repair | capex | unclear`
11. **timing** — 当期費用・前払・未払のどれですか？
   - hint: `current_expense | prepaid | accrued`

## CLI

```bash
orgos operations sole-prop-blue expense-intake clarify --amount 150000
orgos operations sole-prop-blue expense-intake apply --from path/to/intake.yaml
```