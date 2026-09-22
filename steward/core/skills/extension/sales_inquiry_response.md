# Skill: sales_inquiry_response

## 目的

インバウンド問合せ（`INQ-*`）への **初回回答下書き**。FAQ 照合 → 想定回答提案 → 対応下書き（送付の一歩前）。送信は人間承認後。

## 使用 Agent

Sales Inbound Agent · Mail Outbound

## FAQ 正本

**Path:** `data/sales/inbound/faq.yaml`  
**Cursor（任意）:** `@tenants/<id>/data/sales/inbound/faq.yaml`

L0/L1 テンプレのみ。問合せ本文・個人連絡先は FAQ に書かない。

## ワークフロー

1. （任意）問合せ本文は `body_ref`（records vault）に置き、Privacy Mode で `@file` 参照のみ
2. `orgos sales inquiry-reply-propose --inquiry-id INQ-…` — FAQ 照合・SLA ゲート・L2 は ref のみ
3. `orgos sales inquiry-sla-gate` — 期限超過の一括検知（下書き提案一覧）
4. `orgos sales inquiry-reply-draft --inquiry-id INQ-… --to …` — correspondence draft 作成（**未送信**）
5. 人間 `org approval approve` / Chat 承認
6. `orgos mail outbound correspondence send`

レガシー手書き下書き: `orgos sales draft inquiry-response --inquiry-id … --to … --subject … --body …`

## 出力

- ProposeReport: `inquiry-reply-propose-report` / `inquiry-sla-gate-report`
- 下書き: `docs/executive/correspondence-drafts/`（`inquiry_id` 付き）
- 送信後: inquiries `status: responded` · `next_action_due`

## 禁止

- チャット・tracked MD への L2 本文・個人連絡先の転記
- 契約条件・金額の未検証確約
- 自動送信・無人承認
