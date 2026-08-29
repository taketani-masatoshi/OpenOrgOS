# Skill: sales_inquiry_response

## 目的

インバウンド問合せ（`INQ-*`）への **初回回答下書き**。事実は CLI、文案は LLM、送信は人間承認後。

## 使用 Agent

Sales Inbound Agent · Mail Outbound

## ワークフロー

1. `orgos sales inbound intake`（必要なら）
2. `orgos mail outbound facts verify --mail-id MSG-... --case INQ-...`
3. `orgos mail outbound compose --mail-id MSG-... --case INQ-...`
4. 人間 `org approval approve --reviewed`
5. `orgos mail outbound correspondence send`

## 出力

- `docs/executive/correspondence-drafts/`
- 送信後: inquiries `status: responded` · `next_action_due`

## 禁止

- 契約条件・金額の未検証確約
- 自動送信
