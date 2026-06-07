# 番町ハイム312 — 月次運用ガイド

**PROP-001** · Property Rental Agent 管轄  
正データ: [`data/properties/PROP-001.yaml`](../../../../data/properties/PROP-001.yaml) · 賃貸契約: [CTR-003](../../../contracts/CTR-003/)

---

## 1. 月次サイクル（毎月）

| # | タスク | 担当 | 成果物 |
|---|--------|------|--------|
| 1 | 賃料請求書生成 | Finance / Property Rental | `npm run steward -- invoice bancho --from YYYY-MM --to YYYY-MM` |
| 2 | PDF/EML 確認・送付 | 代表 | [`invoices/bancho/`](../../../finance/accounting/invoices/bancho/FY2026/) `output/` |
| 3 | 入金確認 | 代表 | [賃料入金確認.csv](templates/rental/賃料入金確認.csv) → `records/` |
| 4 | 月次収支反映 | Finance | `data/finance/monthly/{YYYY-MM}.yaml` の `revenue_bancho` |
| 5 | 空室・稼働確認 | Property Rental | `PROP-001.yaml` の `vacancy_rate` · `rental.monthly_rent` |

**支払条件（CTR-003）:** 毎月末締め · 翌月払い · 月額 **100,000 円**（非課税表示 · 税理士確認）

---

## 2. 本社兼用の整理

番町312は **賃貸借（CTR-003）** と **本社事務所** が同居。以下は税理士と確認し、SoT を更新する。

| 論点 | 現状 SoT | アクション |
|------|---------|-----------|
| 借主名・連絡先 | 株式会社サウスウッド（STK-003）· 担当 鈴木氏 | `data/contracts/CTR-003.yaml` · STK-003 profile |
| 自社使用 vs 第三者賃貸 | 満室・10万/月想定 | 実態と乖離があれば按分方針を Finance へ |
| 事務所家賃（本社固定費） | 0 円想定 | [`fixed-costs.yaml`](../../../../data/finance/fixed-costs.yaml) と整合 |

---

## 3. 修繕・問合せ

1. 借主・管理会社からの連絡 → [修繕問合せ記録.csv](templates/rental/修繕問合せ記録.csv)
2. 10 万円超・構造部分 → [REG-004 稟議](../../../company/regulations/ringi-kessai-kisoku.md) · Contract Agent へ
3. 火災・漏水等の緊急 → 119/110 · 保険（CTR-013 加入後）連絡

---

## 4. 月末チェックリスト

- [ ] 請求書送付済（または送付予定日確定）
- [ ] 入金記録 CSV 更新
- [ ] `revenue_bancho` が予実と一致（`npm run validate`）
- [ ] 契約・保険の期限アラートなし（`npm run steward -- alerts`）
- [ ] 必要なら Property Rental 要約を `docs/reports/agent-summaries/prop-001/` に出力

---

## 関連

- [annual-checklist.md](annual-checklist.md)
- [operations/00-このフォルダについて.md](00-このフォルダについて.md)
- [`property_rental_agent.md`](../../../../steward/agents/property_rental_agent.md)

*最終更新: 2026年6月*
