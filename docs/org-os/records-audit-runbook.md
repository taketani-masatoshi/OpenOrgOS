# 記録監査（records_audit）運用手順

**Agent:** `records_audit` · **正本:** [records_audit_agent.md](../../steward/core/agents/records_audit_agent.md)  
**ADR:** [0045-company-events-chain-trust-anchor.md](../adr/0045-company-events-chain-trust-anchor.md)

---

## 0. Console から（既定）

Operator Console のエグゼクティブホーム「会社イベント」パネルで、起票・クローズ・アーカイブ・無効化（理由必須）とチェーン検証ができる。

| 操作 | BFF | 権限 |
|---|---|---|
| 一覧（月・status・クローズ/無効を含む） | `GET /chat/v1/events/open` | `chat:read` |
| 起票 | `POST /chat/v1/events` | `events:write` |
| クローズ / アーカイブ / 無効化 | `POST /chat/v1/events/:id/close｜archive｜void` | `events:write` |
| チェーン検証 | `GET /chat/v1/events/chain/verify` | `chat:read` |

無効化は wire で外部に露出済みのイベントを lib（`assertCanVoidCompanyEvent`）が拒否し、画面には理由が 422 で返る。CLI と Console は同じ lib（`src/lib/company-events-chain-report.ts` ほか）を通る。

## 1. 日常確認（CLI）

```bash
orgos events chain verify
orgos agent pulse --agent records_audit
orgos agent readiness --agent records_audit
```

Pulse 鮮度（manifest 定義）:

| チェック | 閾値 |
|---------|------|
| 週次 attestation | `company-events-attestations.jsonl` ≤ 8 日 |
| 月次監査レポート | `docs/reports/agent-summaries/records-audit/` ≤ 35 日 |

---

## 2. 週次（毎週）

```bash
orgos events chain verify
orgos events chain attest
orgos events chain pin    # 任意 · 週次 attest 後に自動 pin される場合あり
```

または:

```bash
orgos pipeline run weekly   # attest を含む
orgos skills run company-events-weekly-attest
```

---

## 3. 月次（毎月）

```bash
orgos events audit monthly [--month YYYY-MM]
```

または:

```bash
orgos pipeline run monthly
orgos skills run company-events-monthly-audit
```

通知イベント: `company_events_monthly_audit`（webhook / OpenWebUI registry 設定）

---

## 4. 初回移行（hardening 導入後）

```bash
orgos events chain migrate --dry-run
orgos events chain migrate
orgos events chain attest --force   # key_id 付き attestation を積む
```

Legacy attestation（`key_id` なし）は warn。厳格運用:

```bash
orgos events chain verify --strict-legacy
orgos events audit monthly --strict-legacy
```

---

## 5. 鍵ローテーション（漏洩疑い · 定期）

**要件:** ceo ロール + `events:write`

```bash
orgos events chain rotate-key
orgos events chain attest --force
```

監査ログ: `events_signing_key_rotate` · 旧鍵は signing-meta `history` に残る（旧 attestation 検証可）

---

## 6. 第三者検証 bundle

```bash
orgos events chain export --out ./audit-bundle-YYYY-MM
cd audit-bundle-YYYY-MM && node verify-bundle.mjs
```

出力に L2 値（notes 本文 · related 詳細）は含まない（digest のみ）。

---

## 7. verify FAIL 時の対応

| 症状 | 対応 |
|------|------|
| `chain-payload-digest-mismatch` | **台帳改竄疑い** — バックアップと diff。`backfill --force` 禁止 |
| `chain-digest-mismatch` / `chain-corrupt-line` | チェーン改竄 · 破損 — Git / バックアップから `company-events-chain.jsonl` 復元 |
| `attestation-signature-invalid` | 署名不正 — 正本 meta と照合。不正行は append-only のため新規 attest で上書き不可 · 調査 |
| `witness-pin-mismatch` | pin 以降のチェーン改竄 — 復元後 `events chain pin` |
| `chain-duplicate-create` / `chain-orphan-create` | テスト汚染 · 台帳不整合 — `events chain repair --i-understand-repair`（ceo · バックアップ付き） |

### 禁止

**`events chain backfill --force` を復旧手段に使わない。** 破壊的再構築（void/status 履歴喪失）。使用は `ORGOS_EVENTS_CHAIN_REBUILD=1` + ceo + `--i-understand-rebuild` の隔離口のみ。

正しい復旧: Git 履歴 · バックアップ · 新規 compensating EVT（Event First 原則）。

**Console には出さない。** `chain backfill --force` は BFF に露出せず、CLI の隔離口のみに残す。

| `weekly-attestations-missing` | `events chain attest` 未実行 — 週次 pipeline 確認 |

---

## 8. 定期実行（cron / launchd）

`pipeline run weekly` / `monthly` は `events:write` が必要。CEO または専用 operator で:

```bash
export ORGOS_TENANT=mal
export ORGOS_OPERATOR_ID=OP-001
export ORGOS_OPERATOR_KEY=<key from operator init-registry>

# 週次（日曜 03:00 等）
npm run orgos -- pipeline run weekly

# 月次（毎月 1 日）
npm run orgos -- pipeline run monthly
```

launchd 例: `scripts/install-pipeline-launchagent.sh mal`（`deploy/launchd/com.openorgos.pipeline-*.plist`）。operator 認証は `tenants/{id}/.env.operator`（gitignore）を pipeline スクリプトが自動読込。

FAIL 時は pipeline が `records_audit` 向け Work Order を自動起票する（routing: `company-events-weekly-attest` / `company-events-monthly-audit`）。

---

## 9. Work Order 起票（手動）

verify / 月次監査 FAIL 時:

```bash
orgos escalate new --to executive_steward --subject "Company events chain verify FAIL" --notes "..."
```

---

## 10. 関連 CLI 一覧

| コマンド | 用途 |
|---------|------|
| `events chain verify` | チェーン + 台帳照合 |
| `events chain attest` | 週次 Ed25519 署名 |
| `events chain pin` | Witness fixity point |
| `events chain rotate-key` | 鍵ローテ（ceo） |
| `events chain migrate` | v3 / meta v2 移行 |
| `events chain repair` | 台帳からチェーン再構築（ceo · バックアップ付き） |
| `events chain export` | 第三者検証 bundle |
| `events audit monthly` | 月次レポート + 通知 |
| `events wire-status <id>` | Wire void ゲート状態 |
