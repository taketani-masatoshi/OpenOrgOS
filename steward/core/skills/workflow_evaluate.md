# Skill: workflow_evaluate

**Path:** `steward/core/skills/workflow_evaluate.md`  
**Runtime:** `cli`  
**Cursor（任意）:** `@steward/core/skills/workflow_evaluate.md`

## 目的

ワークフロー構成案（`WorkflowDocument`）を **決定論で評価**する。YAML 正本は書かない。LLM は対案オーバーレイのみ（`--llm-file`）。適用は `orgos workflow change apply` + 承認済み APR。

## CLI

```bash
npm run orgos -- workflow evaluate --id WF-system-map --json
npm run orgos -- workflow evaluate --file draft.yaml --json
npm run orgos -- skills run workflow-evaluate --id WF-system-map
```

## 出力

- `findings[]`（error / warning / info）
- `proposed_document`（dangling edge 削除 · sources/targets 再計算）

## 禁止

- 評価結果を黙って `data/org/workflows/` に書くこと
- LLM / MCP からの apply
