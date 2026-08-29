# Skill: jp_consumption_tax_return（消費税申告準備）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_tax_consumption/skills/jp_consumption_tax_return.md`
**Runtime:** `cli` · **Module:** `jp_tax_consumption`

## CLI

```bash
npm run orgos -- skills run jp-consumption-tax-return
npm run orgos -- operations tax-consumption check
npm run orgos -- operations tax-consumption calc --period YYYY-MM
npm run orgos -- operations tax-consumption eligibility --period YYYY-MM
```

申告書は生成しません（区分チェック · 仕訳集計 · 還付候補判定のみ）。
還付申請パックは `jp_consumption_refund`。
