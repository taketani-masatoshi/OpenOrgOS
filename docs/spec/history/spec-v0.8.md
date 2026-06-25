> **履歴アーカイブ — 正本は [docs/spec.md](../../spec.md)。** 本書は凍結コピー。

# Steward OS — Specification v0.8

> **正本:** Phase 3 · Cloud Agent · inbound webhook · PR 自動化。v0.7 は [spec-v0.7.md](spec-v0.7.md)。

## v0.8 変更概要（Phase 3）

| 領域 | 内容 |
|------|------|
| **Inbound webhook** | `steward webhook serve` — HTTP サーバー · ingest → queue drain |
| **Cloud Agent** | `steward/platform/agent/cloud.yaml` · `agent cloud config|watch` · `dispatch --runtime cloud` |
| **Merge PR** | `steward merge pr plan|create` — work order 統合 MD から branch / gh pr |
| **Queue processor** | webhook / CLI 共通 `runQueueDrainInternal` |

## Phase 3 DoD

| ID | 定義 | 確認 |
|----|------|------|
| P3-1 | spec-v0.8 | 本ファイル |
| P3-2 | webhook serve | `webhook serve --once`（health） |
| P3-3 | cloud watch | `agent cloud config` · `agent cloud watch --once` |
| P3-4 | merge pr | `merge pr plan --id IMP-...` |
| P3-5 | tests | `tests/phase3.test.ts` |

## Webhook inbound

正本: [steward/platform/webhook/registry.yaml](../steward/platform/webhook/registry.yaml)

```yaml
inbound:
  enabled: true
  path: /steward/webhook
  host: 127.0.0.1
  port: 9473
```

```bash
# 常駐
npm run steward -- webhook serve

# スモーク（listen → GET /health → exit）
npm run steward -- webhook serve --once

# ファイル ingest（Phase 2 互換）
npm run steward -- webhook ingest --file payload.json
```

POST `/steward/webhook` — JSON `{ event, ref?, payload?, secret? }` または `X-Steward-Secret` ヘッダ。  
受信後 `webhook_received` を queue に push し、既定で drain を実行。

## Cloud Agent

正本: [steward/platform/agent/cloud.yaml](../steward/platform/agent/cloud.yaml)

```bash
npm run steward -- agent cloud config
npm run steward -- agent cloud watch [--once] [--interval 30000]

# dispatch 実行時 runtime 指定
npm run steward -- agent dispatch run --id IMP-... --runtime cloud
npm run steward -- agent dispatch plan --id IMP-... --runtime cloud
```

| runtime | 動作 |
|---------|------|
| `local` | Cursor SDK · ローカル cwd |
| `cloud` | Cursor SDK · `cloud.repository` + `CURSOR_API_KEY` |
| `manifest` | プロンプト MD のみ（SDK 未導入時フォールバック） |
| `auto`（既定） | cloud.yaml + 環境変数から解決 |

## Merge PR

work order 完了 · `escalate merge` 後の executive-notes MD を PR body に使用。

```bash
npm run steward -- merge pr plan --id IMP-...
npm run steward -- merge pr create --id IMP-... [--dry-run]
```

`create` は git checkout/commit + `gh pr create`（gh 未導入時は branch のみ）。  
テスト・ CI では **dry-run / plan のみ** — 実 git/gh は実行しない。

## 関連

- [delegate_implementation.md](../steward/core/orchestrators/delegate_implementation.md)
- [framework-backlog.md](framework-backlog.md) Phase J
- [steward/core/routing/README.md](../steward/core/routing/README.md)
