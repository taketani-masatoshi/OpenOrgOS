# Chat Command Router

WebUI Steward Chat が「依頼 → 特定 CLI / Skill を正確に起動」するための決定論ルータ。

**ADR:** [0035](../adr/0035-chat-command-router.md)

## 流れ（実装順 · 2026-08）

Chat `POST /chat/v1/ask` の決定論 pre-handler は次の順（先勝ち）:

1. 日程調整（scheduling）
2. Fact providers（HR / finance / contract · ADR 0033）
3. テナント設定提案（tenant-config · ADR 0036）
4. 資金繰り（cashflow）
5. Steward orchestrate（Work Order 起票）
6. **Command router（本ドキュメント）**
7. LLM（ワーカーが `supports_tools` のとき tool calling 併用可）

## 許可コマンド（抜粋）

正本は `steward/core/skills/registry.yaml` の `chat.enabled: true`（約 23 件）。下表は代表例のみ。

| kind | 例 |
|------|----|
| **read**（即実行） | `validate`, `doctor`, `hr-headcount`, `contract-expiry`, `permit-expiry`, `variance`, `monthly-close`, … |
| **write**（確認カード） | `dashboard`, 月次監査, Work Order (`escalate-run`), `tenant-config-propose` |
| **approval**（提案のみ） | Wire 送信 / 振込 / 組織承認 — UI 誘導 |

## 確認ゲート

- `kind: read` → 即実行し stdout を返信
- `kind: write` → CLI 文面付きカード → `POST /chat/v1/commands/{plan_id}/run`
- `kind: approval` → カード表示のみ（Wire / broker / 承認 UI へ誘導）

## CLI

```bash
orgos commands list
orgos commands match --text "validate を実行して"
orgos commands match --text "経営ダッシュボード生成" --json
```

## LLM tools

ワーカー `supports_tools: true` のとき:

- `operator_list_commands`
- `operator_run_command`

ローカル Ollama は既定 `supports_tools: false`（決定論ルータが主経路）。

## HTTP

| Method | Path |
|--------|------|
| GET | `/chat/v1/commands` |
| POST | `/chat/v1/commands/preview` |
| POST | `/chat/v1/commands/{plan_id}/run` |

## 顧客管理ワークベンチ（閲覧 · ADR 0047 UI）

| Method | Path | 備考 |
|--------|------|------|
| GET | `/chat/v1/customers/nav` | タブ・サブパネル表示可否 |
| GET | `/chat/v1/customers/outbound` | 施策 + 進行中商談 |
| GET | `/chat/v1/customers/inbound` | 問合せキュー（L2 本文なし） |
| GET | `/chat/v1/customers/after-sales` | CS ヘルス · オンボ / QBR / NPS 要約 |
| GET | `/chat/v1/customers/churn` | 解約 · 休眠（派生） |

Console: `/customers/outbound/` · `/customers/inbound/` · `/customers/after-sales/` · `/customers/churn/`

確認カードの plan は `data/chat/command-plans/` に TTL 約 15 分で永続化。

## Tenant config（modules / standards / agents）

ISMS（ISO-27001）等の有効化、モジュール On/追加、エージェント追加は **手編集 YAML でも可**だが、推奨経路は:

1. Chat / CLI / Operator Console で提案（`tenant.config` · `CFG-…`）
2. CEO が **承認**タブ（`/approvals/`）で diff 確認 → 承認（`reviewed=true`）。能力増加（追加・On）は iPhone Settlement PassKey 必須
3. 適用: YAML + `sync-context`（詳細: [ADR 0036](../adr/0036-tenant-config-approval.md) · [ADR 0037](../adr/0037-dual-passkey-settlement-stepup.md)）

```bash
orgos tenant-config propose --target standards --id ISO-27001 --enabled true
orgos tenant-config propose --target agents --id procurement --enabled true
orgos tenant-config propose --target modules --id language_bridge --enabled true --action import_enable
orgos tenant-config preview --id APR-…
orgos tenant-config approve --id APR-… --reviewed   # PassKey 必須の場合は Console /approvals/ のみ
```
