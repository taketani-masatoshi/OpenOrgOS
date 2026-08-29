# Module Messaging（モジュール間情報伝達）

**版:** 1.0 · **日付:** 2026-08-24  
**ADR:** [0040](../adr/0040-aia-parallel-runtime.md)  
**状態:** Accepted · 永続化/relay ゲート実装済み（`src/lib/module-messages/store.ts`）

## 目的

業務モジュール同士、およびコア Agent との **機械経路** の照会・通知・ハンドオフを型付きにする。人向け Markdown 照会（[folder_access_policy §4](../../steward/rules/folder_access_policy.md)）は残す。

## 二系統

| 経路 | 用途 | 正本 |
|------|------|------|
| **人 / LLM プロンプト** | アドホック照会 MD | `folder_access_policy` §4 テンプレ |
| **機械 / スケジューラ** | 状態・SLA・許可リスト付き | 本仕様 · `schemas/module-message.ts` |

## データ配置

| パス | 内容 |
|------|------|
| `tenants/{id}/data/org/module-messages/registry.yaml` | メタデータ一覧（推奨） |
| `tenants/{id}/data/org/module-messages/{message_id}.yaml` | 個別メッセージ（任意分割） |
| 添付 | `scratch/aia-runs/{run_id}/…` のみ（L2 禁止） |

## ModuleMessage（要約）

```text
message_id          MSG-YYYYMMDD-…
from / to           { id, kind: module|agent|integration }
intent              inquire|inform|handoff|request_summary|request_fact|escalate|reply
confidentiality     L0 | L1   （L2/L3 禁止）
refs[]              path / work_order_id / approval_id / …
reply_to            親 message_id
payload_summary     L1 以下の短い本文（口座番号等禁止）
status              pending|delivered|answered|rejected|expired
```

完全な Zod: `schemas/module-message.ts`。

## 許可ゲート

送信前に次を満たすこと（実装は `module-capability`）:

1. `from` の manifest `permissions.agent_relay` に `to.id` が含まれる（コア内部はポリシー表で許可）。
2. `to` が incomplete / not dispatchable モジュールでない。
3. `confidentiality` が L0/L1。L2 値を `payload_summary` に入れない。
4. 組織間宛は **禁止** — Wire / protocol notice + 人間承認（agent dispatch と同様）。

## モジュール整理ルール

| 状態 | 条件 | 効果 |
|------|------|------|
| complete | `agent.md` + manifest（招待は security 必須） | dispatch / message 可 |
| incomplete | ディレクトリのみ · `agent.md` 欠落 | **not dispatchable** · message 送信先不可 |
| disabled | `modules.yaml` `enabled: false` | 送受信とも拒否 |

## 要約上行との関係

- 定期要約: `summary_dir` → `docs/reports/agent-summaries/`（既存）。
- イベント駆動の短い通知: ModuleMessage `inform` / `request_summary`。
- 横断読取して統合するのは **Integration Agent**（[integration-agent.md](integration-agent.md)）。他モジュールが相手 `data_root` を直読しない。

## Chat / Fact（後続）

- ADR 0035: read skill `integration-brief` 等で未読メッセージ要約。
- ADR 0033: モジュール KPI を Fact Provider に載せる方針（本仕様では要求のみ）。

## 関連

- [aia-parallel-runtime.md](aia-parallel-runtime.md)
- [module-security-manifest](../../schemas/module-security-manifest.ts)
- `src/lib/module-capability.ts`
