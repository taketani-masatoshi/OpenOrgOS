# Operator Console — 本番運用

Steward Chat · Wire Console · MCP の本番 checklist。

> **Demo イメージは本番に使わない。**  
> `ghcr.io/taketani-masatoshi/orgos-demo` / `deploy/demo/` は利用者試用用（auth 緩和 · mock LLM）。手元試用は [quickstart.md](quickstart.md) §0 · 設計は [org-os/demo-docker.md](org-os/demo-docker.md)。

---

## 1. 同一 origin デプロイ（推奨）

Chat と Wire を別ポートで動かすと **セッション cookie が共有されません**。本番は combined server を使います。

```bash
# ビルド（Wire SPA は /wire/ ベース）
npm run operator-console:build

# 起動
export ORGOS_TENANT=demo
export ORGOS_ENV=production
export STEWARD_CHAT_AUTH=1
export ORGOS_COOKIE_SECURE=1
export ORGOS_SESSION_PERSIST=1
unset WIRE_CONSOLE_DEV_PASSKEY
unset ORGOS_CSRF
unset ORGOS_CHAT_AUDIT

orgos operator console start --host 0.0.0.0 --port 9470
```

`ORGOS_ENV=production` では misconfig（auth off · dev passkey · CSRF off 等）があると **サーバー起動が拒否**されます。起動前に `orgos doctor` で `prod_*` を確認してください。

| URL | 用途 |
|-----|------|
| `/` | 予実 · 帳簿 |
| `/approvals/` | CEO 承認受信箱 |
| `/steward/` | Steward Chat |
| `/wire/` | Wire Console SPA |
| `/chat/v1/*` | Chat BFF API |
| `/console/v1/*` | Wire Console API |

**リバースプロキシ（nginx 例）**

```nginx
server {
  listen 443 ssl;
  server_name operator.example.com;

  location / {
    proxy_pass http://127.0.0.1:9470;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

---

## 2. 本番 auth checklist

起動前に `orgos doctor` で `prod_*` チェックを確認。

| 変数 | 本番 | 説明 |
|------|------|------|
| `STEWARD_CHAT_AUTH` | `1`（デフォルト） | `0` は dev のみ |
| `WIRE_CONSOLE_AUTH` | **`prod`** | `dev` / 未設定は dev passkey — 本番では起動拒否 |
| `WIRE_CONSOLE_DEV_PASSKEY` | **未設定** | WebAuthn / OIDC を使用 |
| `ORGOS_COOKIE_SECURE` | `1` | HTTPS 必須 |
| `ORGOS_SESSION_PERSIST` | `1`（デフォルト） | `data/.orgos/sessions.json` |
| `ORGOS_LLM_MOCK` | 未設定 | 本番 mock 禁止 |
| `ORGOS_LLM_TOOLS_WRITE` | **未設定 / `0`** | `1` は LLM の非承認書き込み。本番は doctor / 起動拒否。`operator_approve` はフラグに関係なく LLM に出さない |
| `OPENAI_API_KEY` | 設定 | Operator LLM |
| `ORGOS_CSRF` | 未設定（有効） | `0` は dev/test のみ — POST は Origin/Referer 検証 |
| `ORGOS_ALLOWED_ORIGINS` | 任意 | 追加許可 origin（カンマ区切り） |
| `ORGOS_CHAT_AUDIT` | 未設定（有効） | Chat 操作監査 JSONL |
| `ORGOS_CHAT_AUDIT_LOG` | 任意 | 既定: `data/.orgos/chat-audit.jsonl` |
| `ORGOS_SETTLEMENT_STEPUP` | 未設定（有効） | `0` は dev のみ — tier B/C の PassKey step-up 無効。本番は doctor が拒否 |
| `WIRE_CONSOLE_WEBAUTHN_RP_ID` | 必須（本番） | 公開コンソールホスト（例: `operator.example.com`）。login / settlement 共通 |
| `WIRE_CONSOLE_WEBAUTHN_ORIGIN` | 必須（本番） | `https://` + 上記ホスト（セレモニー origin） |
| `ORGOS_SETTLEMENT_RP_ID` | 非推奨 | 旧 Dual RP 用。セレモニーでは使わない |
| `ORGOS_SETTLEMENT_APPROVE_ORIGIN` | 任意 | ヘルプ HTML 用のみ（既定 `https://approve.oorgos.org`） |

本番デプロイ後: `npm run settlement-passkey:verify -- --url https://<公開ホスト> --tenant <id>`（WebAuthn 整合 + settlement 単体テスト）。iPhone hybrid は [settlement-passkey-production-verification.md](org-os/settlement-passkey-production-verification.md) §3–§6。

セッションストア: `data/.orgos/sessions.json` — バックアップ・ファイル権限（600 推奨）を運用側で設定。

### Dual PassKey（ADR 0037）

| PassKey | 用途 | RP / origin |
|---------|------|-------------|
| **login** | Mac Touch ID → セッション | `WIRE_CONSOLE_WEBAUTHN_RP_ID` · `hints: client-device` |
| **settlement** | iPhone hybrid QR → tier B/C 承認 | **同じ RP** · `hints: hybrid` · origin = `WIRE_CONSOLE_WEBAUTHN_ORIGIN` |

Tier A（〜10万円）と金額なし承認は Chat セッションで可。B/C は settlement assertion 必須。

#### 本番 HTTPS（フェーズ 4）

1. Combined console を公開 HTTPS に載せる（上節の nginx 例）。
2. `WIRE_CONSOLE_WEBAUTHN_RP_ID=operator.example.com`  
   `WIRE_CONSOLE_WEBAUTHN_ORIGIN=https://operator.example.com`
3. Mac Chrome または Safari でログイン（Touch ID）→「iPhone で登録」→ ブラウザ QR → iPhone Face ID。
4. B/C 承認も同じページで hybrid `get`。Bluetooth をオン。オフだと失敗する（Google と同じ）。
5. ローカル検証は引き続き `127.0.0.1`（`localhost` と混ぜない）。

**本番現場検証（フェーズ 4）:**  
自動ゲート: `npm run settlement-passkey:verify -- --url https://<公開ホスト> [--tenant <id>]`  
手動（iPhone hybrid · Bluetooth）: [org-os/settlement-passkey-production-verification.md](org-os/settlement-passkey-production-verification.md)

### CSRF

mutating API（`POST /chat/v1/*` · `POST /console/v1/*`）は **Origin または Referer** が許可 origin と一致することを要求します。ログイン系（`/auth/login` 等）と settlement complete / challenge GET は除外または approve origin を許可。SameSite=Strict cookie と併用。

### RBAC（Operator Registry + Chat / Wire / MCP）

正本: `tenants/{id}/data/org/operators.yaml`

| Permission | 操作 |
|------------|------|
| `chat:read` | Today · approvals 参照 |
| `chat:ask` | Operator 質問 |
| `chat:approve` | 承認実行 |
| `chat:wire` | wire flush · witness |
| `protocol:draft` | Wire Console propose |
| `protocol:approve` | Wire Console approve |
| `agent:dispatch` | CLI agent dispatch / implement |
| `agent:shell` | Shell runtime（aider 等） |
| `broker:transfer` | `orgos broker transfer` |
| `escalate:plan` | `finances add` · `executive calendar` 書込 · `secretary escalate`（consult） |

**CLI data 書込**（`STEWARD_OPERATOR_AUTH=1` または prod）: `finances add` · `executive calendar push/pull` · `executive tasks archive` · `executive brief` · `secretary escalate` · `broker transfer` は `requireCliOperator` 必須。read-only（`validate` · `finances list`）は key 不要。

**Shell 本番:** `ORGOS_SHELL_AUTO_YES=1` 未設定時は `--yes` 付き shell 拒否。未知の `ORGOS_SHELL_PROFILE` は拒否。git コマンドは `git:write` permission 必須。

初期化:

```bash
orgos operator init-registry --tenant mal
export ORGOS_OPERATOR_KEY="$(cat ~/.orgos/operators/OP-001.key)"
orgos --operator-id OP-001 --tenant mal protocol notice list
```

prod では `data/org/operators.yaml` に ceo/approver が必須。MCP Bearer は operator ごとの `key_hash` と照合（共有 `ORGOS_MCP_TOKEN` は dev 向けレガシー）。`/chat/v1/auth/me` が `permissions` を返します。

**OOO / Community SSO ドメイン:** テナント `login_policy.email_domains` を置くと、Operator Console への Google SSO は会社ドメインに限る。個人メールは **創業者1席**（`grandfather_emails` 最大1件・active ceo と一致）のみ。2人目の常勤人間には先に会社ドメインが必要。同じメールを複数テナントの常勤オペレータにしない（ゲストは可）。PassKey は対象外。Community 側は `OOO_LOGIN_EMAIL_DOMAINS` / `OOO_LOGIN_EMAIL_GRANDFATHER`（先頭1件）で同じ方針を先に拒否できる。

**本鍵 SSO / 第2鍵 PassKey:** 本番推奨は会社メール SSO を本鍵、ログイン PassKey を第2鍵（`WIRE_CONSOLE_WEBAUTHN_ALLOW_ADDITIONAL_LOGIN=1` · **最大2本/operator**）。故障時は SSO で再ログインし、壊れた credential を削除してから再登録。

**創業者移行:** `orgos operator login-domain set` · `founder-email retire` · grace 超過は validate で警告/エラー。

**テナント畳み:** `orgos tenant lifecycle declare-winding-down` → liquidator 追加可 → `archive`。archived 中は SSO 拒否。

### Chat 監査ログ

login · logout · message · approve · wire/witness 操作を JSONL に記録（MCP audit と同型）。本番では無効化不可。

---

## 3. MCP（Cursor / Open WebUI）

### stdio（Cursor 推奨）

```bash
export ORGOS_MCP_TOKEN="$(openssl rand -hex 32)"
export MCP_OPERATOR_ID="CEO Assistant"
export MCP_APPROVER_ID="CEO"
orgos mcp start
```

### HTTP/SSE（Open WebUI 等リモート接続）

```bash
export ORGOS_MCP_TOKEN="$(openssl rand -hex 32)"
orgos mcp serve-http --host 0.0.0.0 --port 9478
```

Open WebUI MCP 設定例:

| 項目 | 値 |
|------|-----|
| URL | `http://<host>:9478/mcp/sse` |
| Authorization | `Bearer <ORGOS_MCP_TOKEN>` |

Cursor MCP 設定（`.cursor/mcp.json` 例）:

```json
{
  "mcpServers": {
    "orgos-steward": {
      "command": "orgos",
      "args": ["mcp", "start"],
      "env": {
        "ORGOS_TENANT": "demo",
        "ORGOS_MCP_TOKEN": "<same-token>",
        "ORGOS_WORKSPACE": "/path/to/workspace"
      }
    }
  }
}
```

| 変数 | 説明 |
|------|------|
| `ORGOS_MCP_TOKEN` | 必須（本番）。`ORGOS_MCP_AUTH=0` は dev のみ |
| `ORGOS_MCP_AUDIT` | `0` で監査ログ無効（デフォルト: 有効） |
| `ORGOS_MCP_AUDIT_LOG` | 監査 JSONL パス（既定: `data/.orgos/mcp-audit.jsonl`） |
| `ORGOS_MCP_RATE_LIMIT` | `0` で MCP ツール rate limit 無効（dev/test のみ） |
| `ORGOS_MCP_RATE_LIMIT_MAX` | ツールあたり上限 / 分（既定: 30） |

### MCP ツール一覧

| ツール | 用途 |
|--------|------|
| `steward_today` | Today コンテキスト（L1） |
| `steward_ask` | Operator 質問 |
| `steward_wire_flush` | Wire 配送 flush |
| `steward_witness_register` | Witness 登録（sent/received） |
| `steward_witness_verify` | Witness quorum 検証 |
| `steward_witness_flush` | Witness pending 再送 |

最終承認は Chat/Wire UI または `org approval approve` のみ。MCP に承認ツールはない。

### MCP トークン rotation

```bash
orgos mcp rotate-token   # 新トークン生成 + checklist 表示
```

手順:

1. 新トークン生成: `orgos mcp rotate-token` または `openssl rand -hex 32`
2. Cursor `.cursor/mcp.json` の `ORGOS_MCP_TOKEN` を更新
3. MCP プロセス再起動（Cursor: MCP server reload）
4. `steward_today` で動作確認
5. 旧トークンを env から削除（dual-token 期間は短時間推奨）
6. 監査ログ `data/.orgos/mcp-audit.jsonl` で post-rotation 操作を確認
7. 推奨周期: **90 日** · 漏洩疑い時は即時 rotation

---

## 3.1 HTTP rate limit

| 変数 | 説明 |
|------|------|
| `ORGOS_RATE_LIMIT` | `0` で無効（dev/test のみ）。本番では有効必須 |
| `ORGOS_RATE_LIMIT_MAX` | 一般 mutating API 上限 / 分（既定: 60） |
| `ORGOS_RATE_LIMIT_ASK_MAX` | `/chat/v1/message*` 上限 / 分（既定: 10） |
| `ORGOS_RATE_LIMIT_LOGIN_MAX` | login 上限 / 分（既定: 20） |
| `ORGOS_RATE_LIMIT_WINDOW_MS` | window 長 ms（既定: 60000） |

超過時: HTTP **429** `{ "error": "rate_limit_exceeded" }` + `Retry-After` ヘッダ。

### セッション rotation（本番）

1. 新しい WebAuthn passkey を登録（`WIRE_CONSOLE_WEBAUTHN_ALLOW_REGISTER=1`）
2. 旧 passkey を `.orgos/wire-console-webauthn-credentials.json` から削除
3. `data/.orgos/sessions.json` をローテーション期間中にバックアップ
4. 全 CEO 端末で再ログインを確認
5. 推奨周期: **180 日** · 端末紛失時は即時

---

## 3.2 監視・ヘルス

| エンドポイント | 用途 |
|---------------|------|
| `GET /health` | combined / chat / wire 生存確認 |
| `orgos doctor` | prod checklist · notifications registry |
| `data/.orgos/chat-audit.jsonl` | Chat 操作監査 |
| `data/.orgos/mcp-audit.jsonl` | MCP ツール監査 |

アラート例（cron / systemd timer）:

```bash
curl -sf http://127.0.0.1:9470/health | jq -e '.ok == true'
orgos doctor 2>&1 | grep -E 'prod_|WARN' && exit 1 || exit 0
```

relay daemon 同居: `steward-protocol-relay@demo` が wire + witness pending を定期 flush。combined console と同じ tenant で運用。

---

## 3.3 Witness hub（本番）

1. `orgos hub serve --hub-id HUB-A --port 9474 --data-dir ./data/hub-a`
2. `witness-pool.yaml` に hub URL + public key を設定
3. Chat / MCP から `steward_witness_register` → `steward_witness_verify`
4. 障害時: `orgos protocol witness flush-pending` · `orgos protocol witness reconcile --peer PEER-001`

---

## 3.4 E2E カバレッジマトリクス

| フロー | Wire Console | Steward Chat | Vitest | CI |
|--------|:------------:|:------------:|:------:|:--:|
| login / session | ✓ | ✓ | ✓ | validate.yml |
| wire approve | ✓ | ✓ | — | steward-chat:e2e |
| wire flush | ✓ | ✓ | ✓ | steward-chat:smoke |
| witness register/verify | ✓ | ✓ | ✓ | steward-chat:e2e |
| witness flush | ✓ | ✓ | ✓ | steward-chat:smoke |
| MCP tools | — | — | ✓ | steward-chat:smoke |
| combined origin | — | ✓ | — | operator-console:e2e |
| SSE push toast | — | ✓ | ✓ | steward-chat:e2e |
| WebAuthn Chat | — | ✓ | — | steward-chat:webauthn-e2e |
| MCP HTTP Bearer | — | — | — | steward-chat:smoke |

---

## 7. SLA / on-call

### SLO（初期）

| 指標 | 目標 |
|------|------|
| `GET /health` 可用性 | 99.5% / 月 |
| Witness register P95 | < 30s |
| MCP tool P95 | < 5s |
| Operator Ask P95 | < 60s（LLM 依存） |

### 初動（L1 — CEO UX）

1. `scripts/prod-healthcheck.sh` または `curl -sf https://<host>/health`
2. nginx / systemd 再起動: `steward-operator-console@<tenant>`
3. `npm run prod:verify -- --url https://<host>`
4. `data/.orgos/chat-audit.jsonl` · `mcp-audit.jsonl` 確認

### エスカレーション

| レベル | 担当 | 例 |
|--------|------|-----|
| L1 | CEO / 秘書 | UI 表示 · push 未到達 |
| L2 | Protocol / Wire | witness quorum · relay flush 失敗 |
| L3 | Infra | TLS · hub 常駐 · DB/FS |

cron 例:

```bash
*/5 * * * * OPERATOR_CONSOLE_URL=https://operator.southwood.inc bash /path/to/scripts/prod-healthcheck.sh
```

---

## 4. npm リリース

```bash
npm run version:sync
npm run package:publish-check
git tag -a v0.8.0 -m "OrgOS 0.8.0"
git push origin v0.8.0
```

GitHub repo secrets に `NPM_TOKEN` を設定すると `release.yml` が `@orgos/cli` と `@orgos/wire` を publish します。

---

## 5. 分離デプロイ（非推奨）

| サービス | コマンド | ポート |
|---------|---------|--------|
| Wire Console のみ | `orgos wire console start` | 9470 |
| Steward Chat のみ | `orgos chat start` | 9471 |

この構成では Chat と Wire で **別ログイン** が必要です。本番 CEO 利用には combined を推奨します。

---

## 6. 配布チャネル

| チャネル | コマンド | 状態 |
|---------|---------|------|
| **npm（推奨）** | `npm install -g @orgos/cli` | tag push + `NPM_TOKEN` で publish |
| git clone | `curl -fsSL …/install.sh \| bash` | `ORGOS_VERSION` タグ必須 |
| Homebrew | `brew install orgos-reference/tap/orgos` | Release tarball sha256 更新後 |

```bash
npm run version:sync
npm run package:publish-check
npm run steward-chat:release-check
```

---

## 7. Mail Intake（受信メール監視）

テナント横断 — `receive.sync` が `stub` のテナントは no-op。IMAP 有効テナントのみ:

```bash
export ORGOS_TENANT=mal
# 資格情報: ORGOS_IMAP_USER/PASSWORD または ORGOS_SMTP_*（同一アカウント時）
# 設定: records/executive/mail-config.yaml の receive.imap_host

# 1 回取込 + 自動トリアージ
orgos mail intake sync

# cron（5 分ごと例）
*/5 * * * * ORGOS_TENANT=mal orgos mail intake sync >> /var/log/orgos-mail-intake.log 2>&1

# 常駐ポーリング
orgos mail intake sync --watch
```

Secretary への受信ハンドオフ:

```bash
orgos mail intake list --unprocessed
orgos mail intake handoff --id MSG-...
```

高優先度は Today / `mail_triage_high` 通知（`steward/platform/notifications/registry.yaml`）。
