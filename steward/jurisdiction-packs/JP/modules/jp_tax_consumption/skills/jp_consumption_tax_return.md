# Skill: jp_consumption_tax_return（消費税申告準備）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_tax_consumption/skills/jp_consumption_tax_return.md`
**Runtime:** `cli` · **Module:** `jp_tax_consumption`

## CLI

```bash
npm run orgos -- skills run jp-consumption-tax-return
npm run orgos -- operations tax-consumption check
npm run orgos -- operations tax-consumption calc --period YYYY-MM
npm run orgos -- operations tax-consumption eligibility --period YYYY-MM
npm run orgos -- tax consumption-return-rows --fiscal-year YYYY
```

公式様式と e-Tax は出さない。10%/8% 集計は対応表で第一表・付表の行に載せる（提出しない）。
還付申請パックは `jp_consumption_refund`。
