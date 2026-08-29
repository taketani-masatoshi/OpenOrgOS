# Skill: pm_milestone_tracking

## 目的

オープンなマイルストーンの期限超過と間近（既定 14 日）を決定論的に出す。

## 入力

- `data/projects/PRJ-*.yaml`
- 任意 `--days`（間近の窓）

## 出力

- 期限超過一覧 · 間近一覧（案件 id + due）

## 使用 Agent

Project Management Agent

## CLI

```bash
npm run orgos -- pmo milestones
npm run orgos -- pmo milestones --days 14
npm run orgos -- skills run pmo-milestones
```

## runtime

`cli` — LLM 不要。叙述が必要なら `pm_status_review` に CLI 結果を添付する。

## 禁止

- 個人名の出力
- Work Order の単独起票
