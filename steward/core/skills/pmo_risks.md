# Skill: pmo_risks（open リスク）

## 目的

`data/projects/PRJ-*.yaml` の open リスクを決定論的に一覧する（L1 要約のみ）。

## 入力

- `data/projects/PRJ-*.yaml`

## 出力

- severity 内訳 · 案件 id + 要約

## 使用 Agent

Project Management Agent

## CLI

```bash
npm run orgos -- pmo risks
npm run orgos -- pmo risks --json
npm run orgos -- skills run pmo-risks
```

## runtime

`cli` — LLM 不要。

## 禁止

- 個人名の出力
- リスク台帳をモジュール YAML から複製すること
