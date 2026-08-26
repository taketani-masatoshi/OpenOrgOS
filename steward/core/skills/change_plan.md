# Skill: change_plan

**Path:** `steward/core/skills/change_plan.md`  
**Runtime:** `cli`

## 目的

ローカル LLM / Operator 向けの **等級付き変更提案** を決定論生成する。YAML を直接書き換えない。

## 等級

| 等級 | 例 | apply |
|------|-----|--------|
| A | opened_date / max_guests / sync-derived | dry-run 後、確認カードで可 |
| B | 予実・宿泊税・滞在台帳 | `--i-understand-grade-b` 必須 |
| C | 損金設計・許可変更届・保険を外す | plan のみ。apply 禁止 |

## CLI

```bash
npm run orgos -- change plan --intent-file intent.yaml
npm run orgos -- skills run change-plan
```

Intent 例:

```yaml
grade: A
summary: 亀沢定員を 8 名に
intent_id: set_max_guests
max_guests: 8
```
