# LLM Worker Pool

正本 ADR: [0034-llm-worker-pool-routing.md](../adr/0034-llm-worker-pool-routing.md)

## 概要

Operator Console の LLM 呼び出しは **ワーカー登録簿 + キュー** 経由で振り分ける。

- **ローカル優先**（Ollama / LM Studio など OpenAI 互換）
- 待ち時間がしきい値を超え、クラウド昇格が ON のときだけ OpenAI / Anthropic へ
- API キー本体は環境変数。YAML / HTTP には **env 名のみ**

## 設定ファイル

`tenants/{id}/data/llm/workers.yaml`

```yaml
schema: orgos.llm.workers.v1
queue:
  max_queue: 64
  queue_timeout_ms: 120000
  cloud_overflow:
    enabled: false
    wait_threshold_ms: 8000
    max_inflight: 2
workers:
  - id: mini-01
    label: Mac mini 01
    tier: local
    provider: openai-compatible
    base_url: http://192.168.1.21:11434/v1
    model: gemma3:12b
    max_inflight: 2
    enabled: true
    api_key_env: ""
    supports_tools: false
  - id: openai-01
    label: OpenAI
    tier: cloud
    provider: openai-compatible
    base_url: https://api.openai.com/v1
    model: gpt-4o-mini
    max_inflight: 4
    enabled: true
    api_key_env: OPENAI_API_KEY
    supports_tools: true
```

ファイルが無い場合は従来の `ORGOS_LLM_*` / `OPENAI_*` / `ANTHROPIC_*` から 1 worker を合成する。

- **ローカル既定:** `supports_tools: false`（決定論 Command Router が主）
- **クラウド:** tool calling 可なら `supports_tools: true`

## ローカル応答規約（ERROR fallback · ADR 0061）

worker `tier: local` では、prompt / tool 結果に必要情報が無いとき LLM は **`ERROR: <理由>` の1行のみ** を返す（「未確認」・拒否エッセイ禁止）。runtime が `tool-loop` で block 注入 + enforce する。

- 無効化: `ORGOS_LOCAL_LLM_ERROR_FALLBACK=0`
- 正本: [local-llm-error-fallback.md](../../steward/rules/local-llm-error-fallback.md)

## UI

秘書・スチュワードの見出し右で経路を選ぶ。エージェント別に端末へ保存し、送信ごとに `llm_route` を付ける。

| 選択 | 動作 |
|------|------|
| 自動（ローカル優先） | 現行どおり。ローカル → 待ち超過時のみクラウド昇格 |
| ローカル（任意） / 各ローカル | その tier / ワーカーのみ。クラウドへ溢れない |
| クラウド（任意） / 各クラウド | その tier / ワーカーのみ。ローカルへ戻さない |

登録簿・キュー: `/llm-workers/`（フッターからリンク）

- 権限: 閲覧 `chat:read` · 保存/疎通 `llm:admin`
- レガシー手順ガイド `/cloud-llm/` は **env 直指定の補助**。本番の正本は `workers.yaml` + 本プール（ガイド経由でプールを迂回しないこと）

## HTTP

| Method | Path |
|--------|------|
| GET/PUT | `/chat/v1/llm/workers` |
| POST | `/chat/v1/llm/workers/:id/probe` |
| GET | `/chat/v1/llm/dashboard`（互換スタブ） |
| POST | `/chat/v1/message` · `llm_route?: { mode: auto\|local\|cloud, worker_id? }` |

## CLI

```bash
orgos llm workers init
orgos llm workers list
orgos llm workers probe
orgos llm workers probe --id mini-01
```

## 実装パス

| 役割 | パス |
|------|------|
| Schema | `schemas/llm-workers.ts` |
| Pool | `src/lib/llm-pool/` |
| HTTP | `src/lib/steward-chat/routes/llm-api.ts` · `chat-api.ts` (`llm_route`) |
| SPA | `apps/steward-chat/src/LlmRoutePicker.tsx` · `LlmWorkersPage.tsx` |
