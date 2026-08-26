# Skill: ir_shareholder_comm

## 目的

株主 · 投資家向けコミュニケーション（Q&A 下書き · 更新メール骨子 · 説明会 FAQ）を準備する。

## 使用 Agent

Investor Relations Agent

## 入力

- `data/investor-relations/investor-registry.yaml` — 連絡先索引（id のみ · L2 値なし）
- `data/investor-relations/disclosure-calendar.yaml` — スケジュール
- `docs/company/shareholder-register.md` — governance 正本（Read）

## 出力

`docs/reports/agent-summaries/investor-relations/{YYYY-MM-DD}-shareholder-comm.md`

## CLI（補助）

```bash
npm run orgos -- operations ir disclosure-calendar --days 90
```

## 委譲

- 招集 · 議事録 → **corporate_governance** / **secretary**
- 開示合规 → **legal**

## 禁止

- 未公開情報の外部共有
- メールアドレス · 電話番号のチャット出力（stakeholder_id リンクのみ）
