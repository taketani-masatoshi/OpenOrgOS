> **履歴アーカイブ — 正本は [docs/spec.md](../../spec.md)。** 本書は凍結コピー。

# Steward OS — Specification v0.7

> **正本:** Phase 2 · Agent 自動化拡張。v0.6 は [spec-v0.6.md](spec-v0.6.md)。

## v0.7 変更概要（Phase 2）

| 領域 | 内容 |
|------|------|
| **Agent dispatch** | `steward agent dispatch plan|run` — 並列 manifest · 任意 Cursor SDK |
| **Queue DB** | JSONL `routing-queue/queue/events.jsonl` · `steward queue push|list|drain` |
| **Webhook** | `steward/platform/webhook/registry.yaml` · send · ingest |
| **Auto merge** | `steward escalate merge` · 全子 WO 完了時自動統合 |

## Phase 2 DoD

| ID | 定義 | 確認 |
|----|------|------|
| P2-1 | spec-v0.7 | 本ファイル |
| P2-2 | agent dispatch plan/run | `agent dispatch plan --id IMP-...` |
| P2-3 | queue DB | `queue list` |
| P2-4 | webhook send/ingest | `webhook config` |
| P2-5 | escalate merge | `escalate merge --id IMP-...` |
| P2-6 | tests | `tests/phase2.test.ts` |

## Cursor SDK（任意）

```bash
npm install @cursor/sdk
export CURSOR_API_KEY=...
npm run steward -- agent dispatch run --id IMP-...
```

未インストール時は **manifest モード**（並列 Cursor チャット用プロンプト一覧）。

## 関連

- [delegate_implementation.md](../steward/core/orchestrators/delegate_implementation.md)
- [framework-backlog.md](framework-backlog.md) Phase I
