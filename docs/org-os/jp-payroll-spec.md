# JP 給与計算仕様

**モジュール:** `steward/jurisdiction-packs/JP/modules/jp_payroll/` · **CLI:** `orgos operations payroll`

- 料率正本: `seed/payroll-rates-2026.yaml.example`
- 個人別データは L2 — `stakeholder_id` リンクのみ tracked
- 仕訳: `operations payroll post-journal --month YYYY-MM`
