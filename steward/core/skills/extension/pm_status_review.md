# Skill: pm_status_review

## 目的

CEO 向けの案件状況の叙述。数字は LLM で作らず、先に決定論 CLI を添付する。

## 使用 Agent

Project Management Agent

## 手順

1. `orgos pmo portfolio` と `orgos pmo milestones` を実行する
2. その出力だけを根拠に 5–10 行で述べる
3. 遅延や RAG red は COO へエスカレーション提案に留める（WO 起票はしない）

## 出力

`docs/reports/agent-summaries/project-management/{YYYY-MM-DD}-{topic}.md`

## runtime

`agent` — 叙述のみ。集計は `pmo_portfolio` / `pm_milestone_tracking`。

## 禁止

- CLI に無い数字の創作
- 契約変更 · 請求金額 · WO 承認
