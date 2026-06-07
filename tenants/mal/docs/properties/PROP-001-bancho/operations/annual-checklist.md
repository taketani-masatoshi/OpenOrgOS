# 番町ハイム312 — 年次チェックリスト

**PROP-001** · FY 単位で実施（4 月起点または暦年 — 税理士指示に従う）

---

## A. 契約・保険

| # | 項目 | 期限目安 | 参照 |
|---|------|---------|------|
| A1 | 賃貸借更新（CTR-003） | **2027-02-28** 満了 · 更新協議 **2026-12 前** | `data/contracts/CTR-003.yaml` · `renewal_deadline: 2026-12-01` |
| A2 | 火災保険加入・更新（CTR-013） | **P0 — draft** | [02-enrollment-packet](../../../contracts/CTR-013/02-enrollment-packet.md) |
| A3 | 借入返済・金利見直し（LOAN-001） | 年1回 | [CTR-008](../../../contracts/CTR-008/) |

---

## B. 物件・税務

| # | 項目 | 参照 |
|---|------|------|
| B1 | 固定資産台帳 · 減価償却（47年・353,191円/年） | [`fixed-assets.yaml`](../../../../data/finance/fixed-assets.yaml) · 税理士確認 |
| B2 | 固定資産税・都市計画税 | 税務パック [`company/tax/fy2026/`](../../../company/tax/fy2026/) |
| B3 | 年次設備点検 | [定期点検-年次.md](templates/rental/定期点検-年次.md) → `records/` |

---

## C. 記録・監査

| # | 項目 |
|---|------|
| C1 | `records/` 年次フォルダ作成（例: `records/2027/`） |
| C2 | 賃料入金 CSV 年次アーカイブ |
| C3 | ISO/内部監査で番町関連指摘があれば [compliance/iso/](../../../compliance/iso/) へ反映 |

---

## D. 完了後

```bash
npm run steward -- deps check --file data/properties/PROP-001.yaml
npm run validate
```

Property Rental Agent 要約: `docs/reports/agent-summaries/prop-001/{YYYY-MM-DD}-annual.md`

---

*最終更新: 2026年6月*
