# Skill: jp_women_empowerment_kpi（KPI 未設定チェック）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_women_empowerment/skills/women_empowerment_kpi.md`
**Runtime:** `cli` · **Module:** `jp_women_empowerment` · **Agent:** Compliance

## 目的

行動計画の数値目標を一覧し、`baseline` / `target` が未設定の KPI を `⚠ 未設定` として明示する。公表前に人事が確定すべき値を洗い出す用途。施策は期限順に並べる。

## 入力

- `data/declarations/jp-women-empowerment/declaration.yaml` — `targets`
- `data/declarations/jp-women-empowerment/action-plan.yaml` — `items`

## CLI

```bash
npm run orgos -- skills run jp-women-empowerment-kpi
npm run orgos -- operations women-empowerment kpi --json
npm run orgos -- operations women-empowerment validate
```

## 使用 Agent

Compliance Agent · Operations Agent（人事施策 Read）

## 禁止

未確定の KPI に推計値を充てない。数値は人事の確定後に `declaration.yaml` へ記録する。
