# Skill: jp_payroll_run（給与計算）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_payroll/skills/jp_payroll_run.md`
**Runtime:** `cli` · **Module:** `jp_payroll`

## CLI

```bash
npm run orgos -- skills run jp-payroll-run
npm run orgos -- operations payroll calc --month 2026-09
npm run orgos -- operations payroll post-journal --month 2026-09
```

個人名・口座番号は出力しません。明細は L2 `data/hr/payroll-detail/` を参照。
