# Skill: jp_corporate_tax_return（法人税申告書準備）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_tax_corporate/skills/jp_corporate_tax_return.md`
**Runtime:** `cli` · **Module:** `jp_tax_corporate`

## CLI

```bash
npm run orgos -- skills run jp-corporate-tax-return
npm run orgos -- operations tax-corporate calendar
npm run orgos -- operations tax-corporate gaps
npm run orgos -- operations tax-corporate depreciation
npm run orgos -- operations tax-corporate xml-draft
```

本 Skill はカレンダー · ギャップ · 減価償却検算。提出用 XML ドラフトは `xml-draft`（ADR 0052 の 5b）。e-Tax 本番提出は 5c（人間 / 税理士）。
