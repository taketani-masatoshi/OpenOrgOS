# Skill: jp_carbon_neutral_targets（中間目標・削減施策）

**Path:** `steward/jurisdiction-packs/JP/modules/jp_carbon_neutral_2050/skills/carbon_neutral_targets.md`
**Runtime:** `cli` · **Module:** `jp_carbon_neutral_2050` · **Agent:** Compliance

## 目的

中間目標（年 · スコープ · 削減率）と、それを支える行動計画を期限順に並べて返す。削減量未算定の目標・施策は `未算定` として明示する。

## 入力

- `data/declarations/jp-carbon-neutral/declaration.yaml` — `interim_targets`
- `data/declarations/jp-carbon-neutral/action-plan.yaml` — `items`

## CLI

```bash
npm run orgos -- skills run jp-carbon-neutral-targets
npm run orgos -- operations carbon-neutral targets --json
npm run orgos -- operations carbon-neutral validate
```

## 使用 Agent

Compliance Agent · Finance Agent（エネルギー費用予実 Read）· Operations Agent（設備記録 Read）

## 禁止

行動計画にない施策を目標達成根拠として提示しない。
