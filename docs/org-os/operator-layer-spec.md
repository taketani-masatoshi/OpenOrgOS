# OrgOS Operator Layer Specification

**Status:** v1.1 · **Parent:** [orgos-interface-spec.md](orgos-interface-spec.md)

---

## 1. 境界 I4 — CEO ↔ Operator ↔ Implementation

| 層 | 主体 | 認証 · 権限 |
|----|------|-------------|
| CEO | 人間 | WebAuthn / OIDC（Wire）· session cookie |
| Operator | LLM + 人間オペレータ | `operators.yaml` RBAC · Chat/Wire/MCP/CLI 統一 enforce |
| Implementation | Agent + Skill + CLI | tenant jail · delegation scopes · folder policy |

**組織間:** Agent cross-org dispatch 禁止 — `protocol notice` + 人間 approve のみ（`src/lib/org-boundary.ts`）。

**CLI mutation:** `orgos --operator-id OP-xxx` + operator key（`broker transfer` · `escalate` · `protocol approve` 等）。

| 方向 | 形式 | 正本 |
|------|------|------|
| CEO → Operator | 自然言語 · Steward Chat BFF | `POST /chat/v1/message` · `/message/stream` |
| Operator → Implementation | `orgos` CLI · ファイル編集 | `data/` · `docs/` |
| Implementation → CEO | Today コンテキスト · push | `GET /chat/v1/today` · notifications |

**Operator 正本:** [steward/rules/operator-policy.md](../../steward/rules/operator-policy.md)

---

## 2. コンポーネント

| コンポーネント | パス | ポート |
|----------------|------|--------|
| **Combined Operator Console** | `src/lib/operator-console/` | `:9470` |
| Steward Chat BFF | `src/lib/steward-chat/` | combined 内 `/chat/v1/*` |
| Wire Console BFF | `src/lib/wire-console/` | combined 内 `/console/v1/*` · SPA `/wire/` |
| Operator runtime | `steward/platform/agent/runtime.yaml` | — |
| Notifications | `steward/platform/notifications/registry.yaml` | — |
| Steward Chat SPA | `apps/steward-chat/` | combined `/` |

本番 CEO 利用は **combined console**（同一 origin · 共有 session cookie）を正本とする。分離デプロイ（Chat `:9471` · Wire `:9470`）は非推奨。

---

## 3. CLI

```bash
orgos operator sync-policy [--emit cursor|agents-md|dev-guide|engineering|all]
orgos operator export [--agent finance] [--all] [--emit packs|index|mcp|all]
orgos operator portability [--json] [--write]
orgos operator runtime show|test
orgos operator console start [--host 0.0.0.0 --port 9470]
orgos chat start|today|ask
orgos agent dispatch run --runtime shell   # default
orgos pipeline run daily                   # + notifications push
orgos mcp start                              # stdio
orgos mcp serve-http [--port 9478]         # HTTP/SSE + Bearer
orgos mcp rotate-token
```

---

## 4. Runtime adapters

| Adapter | 設定 | 用途 |
|---------|------|------|
| **shell** | `runtime.yaml` · profiles | aider / cline / openhands（default） |
| **portable** | `orgos agent implement` · dispatch fallback | LLM API · shell · manifest（Cursor 不要） |
| **cursor** | `@cursor/sdk` + `CURSOR_API_KEY` | Cursor SDK |
| **manifest** | fallback | プロンプト MD のみ |
| **mcp stdio** | `orgos mcp start` | Cursor / Continue · `ORGOS_MCP_TOKEN` |
| **mcp http** | `orgos mcp serve-http` | Open WebUI 等 · `Authorization: Bearer` |

### MCP ツール（7 本）

| ツール | 用途 |
|--------|------|
| `steward_today` | Today コンテキスト（L1） |
| `steward_ask` | Operator 質問 |
| `steward_approve` | 承認実行 |
| `steward_wire_flush` | Wire 配送 flush |
| `steward_witness_register` | Witness 登録 |
| `steward_witness_verify` | Witness quorum 検証 |
| `steward_witness_flush` | Witness pending 再送 |

---

## 5. Chat BFF API（抜粋）

| Method | Path | Permission |
|--------|------|------------|
| GET | `/chat/v1/today` | `chat:read` |
| GET | `/chat/v1/operator/stats` | `chat:read` |
| POST | `/chat/v1/message` · `/message/stream` | `chat:ask` |
| POST | `/chat/v1/wire/flush` | `chat:wire` |
| GET | `/chat/v1/events/stream` | `chat:read` |

Today コンテキストは **human-mail 承認待ち** と **wire delivery 配送待ち**（`wire-queue`）を区別して返す。

---

## 6. 本番セキュリティ

`ORGOS_ENV=production` では [prod-checklist.ts](../../src/lib/console-auth/prod-checklist.ts) が起動前に検証:

| チェック | 本番要件 |
|---------|---------|
| Auth | `STEWARD_CHAT_AUTH=1` |
| Wire auth | `WIRE_CONSOLE_AUTH=prod` |
| Operator registry | `data/org/operators.yaml` + ceo/approver |
| Dev passkey | 未設定 |
| Secure cookie | 公開 host では `ORGOS_COOKIE_SECURE=1` |
| CSRF | `ORGOS_CSRF=0` 禁止 |
| Rate limit | `ORGOS_RATE_LIMIT=0` 禁止 |
| Chat audit | `ORGOS_CHAT_AUDIT=0` 禁止 |
| MCP | `ORGOS_MCP_TOKEN` 必須 |

---

## 7. E2E マトリクス

| フロー | Wire Console | Steward Chat | Combined | CI |
|--------|:------------:|:------------:|:--------:|:--:|
| login / session | ✓ | ✓ | ✓ | validate.yml |
| WebAuthn prod | ✓ | ✓ | — | validate.yml |
| wire approve / flush | ✓ | ✓ | ✓ | steward-chat:e2e |
| wire delivery Today | — | ✓ | ✓ | smoke |
| witness register/verify | ✓ | ✓ | ✓ | e2e |
| MCP tools (stdio + HTTP) | — | — | — | smoke |
| SSE push toast | — | ✓ | ✓ | e2e |

正本: [operator-production.md](../operator-production.md) §3.4

---

## 8. Skill runtime

| runtime | 意味 |
|---------|------|
| `cli` | LLM 不要 · `orgos skills run` |
| `agent` | LLM + workspace · shell adapter |

| `cursor-only` | **非推奨 alias** — 読取時 `agent` と同義（LLM + 定義添付） |

---

**版:** 2026-06-28 · v1.1（combined console · MCP 7 tools · HTTP Bearer · rate limit / CSRF / RBAC · E2E マトリクス）
