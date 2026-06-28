# COO への Growth Team 委譲 — Orchestrator

**用途:** Steward / CEO から COO 経由で営業・マーケ・CS・制作ラインへ **Work Order** を出すときの雛形。

## 委譲フォーマット

```markdown
**件名:** {一行}
**背景:** {なぜ今}
**実装要件:** {完了条件 · 担当 Agent id}
**優先度:** P0|P1|P2|P3
**期限:** YYYY-MM-DD
**担当:** sales_lead | marketing_lead | customer_success | cto | coo
```

## CLI

```bash
npm run orgos -- escalate plan --text "$(cat request.md)"
npm run orgos -- route match --text "新規リード10社リスト"
```

## 担当早見表

| 依頼内容 | 第一担当 | 第二担当 |
|---------|---------|---------|
| リスト · 初回メール | sales_outbound | sales_lead |
| 問い合わせ · 提携 | sales_inbound | sales_lead |
| 既存顧客フォロー | customer_success | sales_lead |
| 記事 · LP · 施策 | marketing_lead | social_media |
| SNS 投稿 | social_media | marketing_lead |
| 機能実装 · バグ | engineering | cto |
| UI · 素材 | design | design_lead |
| 定款 · 登記ドラフト | legal | secretary |

## ガードレール

- COO は **割当と進捗** のみ — 契約締結 · 振込 · 公開投稿の最終実行は人間
- 各 Agent は [org-chart.md](../agents/org-chart.md) の Primary Folders のみ編集
- 完了時: `npm run orgos -- validate` · 要約を `agent-summaries/{agent}/` へ
