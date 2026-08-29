# Skill: jp_carbon_neutral_show（宣言サマリ）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_carbon_neutral_2050/skills/carbon_neutral_show.md`
**Runtime:** `cli` · **Module:** `jp_carbon_neutral_2050` · **Agent:** Compliance

## 目的

2050年カーボンニュートラル宣言の状態を一目で返す — 署名 · 公表 · 基準年 → ネットゼロ年 · 中間目標数 · 行動計画の進捗 · レビュー期限。

## 入力

- `data/declarations/jp-carbon-neutral/declaration.yaml`（未展開時は module seed）
- `data/declarations/jp-carbon-neutral/action-plan.yaml`
- `docs/compliance/declarations/carbon-neutral-2050.md`（公表文の有無）

## CLI

```bash
npm run orgos -- skills run jp-carbon-neutral-show
npm run orgos -- operations carbon-neutral show --json
```

## 禁止

未検証の削減率を宣言値として扱わない。数値の確定は Finance · Operations の実測後。
