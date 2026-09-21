# Skill: jp_consumption_refund_show（消費税還付クレーム一覧）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_consumption_refund/skills/jp_consumption_refund_show.md`
**Runtime:** `cli` · **Module:** `jp_consumption_refund`

## CLI

```bash
npm run orgos -- skills run jp-consumption-refund-show
npm run orgos -- operations consumption-refund show
```

提出は人間承認後。e-Tax 自動送信はしない（ADR 0052 の 5c）。
