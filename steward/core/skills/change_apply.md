# Skill: change_apply

**Path:** `steward/core/skills/change_apply.md`  
**Runtime:** `cli`

## 目的

`change plan` で保存した提案を dry-run または apply する。Chat では **write confirmation plan**（CommandActionCard）経由のみ。

## CLI

```bash
npm run orgos -- change apply --proposal CHG-… --dry-run
npm run orgos -- change apply --proposal CHG-… --write
npm run orgos -- change apply --proposal CHG-… --write --i-understand-grade-b
```

## 禁止

- grade C の apply
- 許可パス外の書込
- 提案文への「ダミー」混入
