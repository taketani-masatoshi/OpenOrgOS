/**
 * ADR 0071 — Executive tasks.yaml SSOT + Secretary Workbench
 *
 * - **Status:** Accepted
 * - **Date:** 2026-09-16
 */

## Context

MAL の日次運用では、メール triage・correspondence drafts・P0 台帳
（`docs/company/executive-remaining-tasks.md`）・Work Order・承認・Asana が
分散していた。`data/executive/tasks.yaml` はスキーマと Asana
`executive_task` ミラーを持っていたが正本としては空で、秘書 UI は
`/secretary/` チャットと `/wire/` MailWorkbench に分かれていた。

新しい業務モジュールを増やすより、既存 YAML を育てて一画面に束ねる方が
「会社が回っている」感につながる。

## Decision

1. **タスク正本は `data/executive/tasks.yaml` のみ** — 担当・優先度・状態の
   意思決定はここに書く。メール triage / Work Order / 承認は候補ソース。
2. **スキーマ拡張は後方互換** — `origin` / `links` / `module_id` /
   `property_id` / `next_action` / `blocked_on` / `updated_at` は optional
   または default。既存 `source` は deprecated として残す。
3. **Asana は写し** — `POST /chat/v1/integrations/asana/push`
   (`kind: executive_task`) が成功したら `links.asana_task_gid` を更新する。
   Asana 側を正本にしない。
4. **Secretary Workbench** — `GET /chat/v1/secretary/workbench`（`chat:read`）と
   `/secretary/workbench/`。受信・下書き・タスク・承認・会社状態を L1 範囲で表示。
   既存 `/secretary/` チャットは変更しない。
5. **P0 MD は一方向 import** — `orgos executive tasks import-p0`（既定 dry-run）。
   Markdown との双方向同期はしない。

## Consequences

- CLI: `orgos executive tasks list|add|close|intake|import-p0|archive`
- Console Agents サブナビに「秘書ワークベンチ」を追加
- P0 台帳パーサはチェックリスト行のみ対象（見出しで優先度を推定）

## Related

- [0065](0065-executive-home-console.md) — Executive Home
- [0070](0070-console-saas-connectors.md) — Console SaaS connectors（Asana）
- [0035](0035-chat-command-router.md) — Chat Command Router
