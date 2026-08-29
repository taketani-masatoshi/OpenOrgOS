# Skill: jp_consumption_refund_eligibility（消費税還付適格）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_consumption_refund/skills/jp_consumption_refund_eligibility.md`
**Runtime:** `cli` · **Module:** `jp_consumption_refund`

## CLI

```bash
npm run orgos -- skills run jp-consumption-refund-eligibility --period YYYY-MM
npm run orgos -- operations consumption-refund eligibility --period YYYY-MM
```

申請書は生成しません。簡易課税還付は既定 `blocked`。
