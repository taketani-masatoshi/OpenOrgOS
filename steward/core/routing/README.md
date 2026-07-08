# Agent ルーティング · 実装委譲（Phase 1）

静的レジストリ + classification アクセスチェック + handoff / work order キュー。

| 層 | 正本 | 実装 |
|---|---|---|
| Capability check | `data/classification-registry.yaml` | `src/lib/classification.ts` |
| Route registry | `steward/core/routing/registry.yaml` | `src/lib/routing.ts` |
| Skill dispatch | `steward/core/skills/registry.yaml` | `src/lib/skill-registry.ts` |
| Work orders | `docs/reports/routing-queue/` | `src/lib/escalate.ts` |

## task_type

| task_type | 用途 | Orchestrator | ID 例 |
|-----------|------|--------------|-------|
| `consult` | 照会 · 是非 · 手順 | `secretary_escalation.md` | `HO-*` |
| `implement` | コード · docs · schema 実装 | `delegate_implementation.md` | `IMP-*` |

## mode

| mode | 意味 |
|------|------|
| `suggest` | カード / MD 表示のみ（デフォルト） |
| `auto` | 紐づく CLI Skill を `skills run` 実行 |
| `implement` | Work Order 生成済み · Agent プロンプト MD で Cursor 並列起動（Phase 1） |

## CLI — route

```bash
npm run orgos -- route list
npm run orgos -- route match --text "契約期限"
npm run orgos -- classification access --agent secretary --path data/executive/calendar.yaml
npm run orgos -- route handoff --text "契約期限" --from steward
npm run orgos -- route dispatch --id HO-... --mode auto
npm run orgos -- route dispatch --id IMP-... --mode implement
```

## CLI — escalate（実装委譲）

```bash
npm run orgos -- escalate plan --text "..." [--dry-run]
npm run orgos -- escalate run --text "..." --from executive_steward
npm run orgos -- escalate run --id IMP-...     # プロンプト再生成
npm run orgos -- escalate status [--pending|--blocked]
npm run orgos -- escalate complete --id IMP-... --notes "..."
```

**出力:** `docs/reports/routing-queue/IMP-*.{yaml,md}` · `prompts/IMP-*_{agent}.md`

## 境界

- `data/executive/**` · `docs/executive/**` → **secretary**（management routes）
- KPI / dashboard → **executive_steward**（`boundary: executive_summaries`）
- `module_agent: true` → テナント `modules.yaml` で有効なモジュール Agent のみ

## Phase 2 — Agent 自動化（v0.7 · 実装済）

```bash
npm run orgos -- agent dispatch plan --id IMP-...
npm run orgos -- agent dispatch run --id IMP-... [--dry-run]
npm run orgos -- queue list
npm run orgos -- queue drain
npm run orgos -- webhook config
npm run orgos -- webhook ingest --file payload.json
npm run orgos -- escalate merge --id IMP-...
```

| 機能 | 正本 |
|------|------|
| Dispatch manifest | `routing-queue/DISP-*.yaml` |
| Queue DB | `routing-queue/queue/events.jsonl` |
| Results | `routing-queue/results/{IMP}.yaml` |
| Merge output | `docs/reports/executive-notes/*-merge-*.md` |
| Webhook | [steward/platform/webhook/registry.yaml](../webhook/registry.yaml) |

**Cursor SDK（任意）:** `npm install @cursor/sdk` + `CURSOR_API_KEY` → `agent dispatch run` が並列 `Agent.prompt`

## Phase 3 — Cloud Agent · Webhook · PR（v0.8 · 実装済）

```bash
npm run orgos -- webhook serve [--once]
npm run orgos -- agent cloud config
npm run orgos -- agent cloud watch [--once]
npm run orgos -- agent dispatch run --id IMP-... --runtime cloud
npm run orgos -- merge pr plan --id IMP-...
npm run orgos -- merge pr create --id IMP-... [--dry-run]
```

| 機能 | 正本 |
|------|------|
| Cloud config | [steward/platform/agent/cloud.yaml](../agent/cloud.yaml) |
| Inbound webhook | [steward/platform/webhook/registry.yaml](../webhook/registry.yaml) · `host` / `port` |
| PR manifest | `routing-queue/PR-*.yaml` |
| Queue drain | `src/lib/queue-processor.ts`（CLI · webhook 共通） |

**Cloud runtime:** `steward/platform/agent/cloud.yaml` の `repository` + `CURSOR_API_KEY` が揃うと `--runtime cloud` で SDK クラウド dispatch。

## CLI — audit · compliance

```bash
npm run orgos -- audit log append --event handoff --ref HO-...
npm run orgos -- audit log list [--since YYYY-MM-DD]
npm run orgos -- compliance gap [--tenant mal]
npm run orgos -- pipeline run weekly
```
