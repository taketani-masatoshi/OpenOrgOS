# Wire live verification runbook

**Parent:** [wire-hub-stack-pilot.md](wire-hub-stack-pilot.md) · [deploy/mal-pilot/README.md](../../deploy/mal-pilot/README.md)

---

## 目的

Phase 3（Wire Gateway 本番ゲート）と Phase 4（email_wire）を **env-gated** で再実行し、証跡 JSON を `scratch/` に残す。

- 秘密情報は CLI 出力・証跡 JSON 双方で redact
- Vitest 実行前に停止（`mail-config.yaml` 破壊防止）
- `info@malkk.com` は OrgOS から使用しない（`ai@malkk.com` のみ）

---

## 前提

| 項目 | 値 |
|------|-----|
| Wire 公開 URL | `https://wire.oorgos.org` |
| メール | `ai@malkk.com`（L2: `tenants/mal/records/executive/smtp.env`） |
| Phase 4 設定 | `tenants/mal/records/executive/mail-config.yaml` |
| ゲート env | `ORGOS_LIVE_VERIFY=1` **必須** |
| 衛生 | 実行前に `./scripts/mal-wire-hygiene.sh mal`（`wire-live-verify.sh` が自動実行） |

---

## コマンド

### 衛生（鍵 · DID · mail-config · PEER-003）

```bash
./scripts/mal-wire-hygiene.sh mal
```

### Check のみ（外部 SMTP 送信なし）

```bash
ORGOS_LIVE_VERIFY=1 ./scripts/wire-live-verify.sh mal check
# または
ORGOS_LIVE_VERIFY=1 npm run orgos -- wire live-verify --tenant mal
```

### Phase 4 roundtrip 込み（SMTP/IMAP live）

```bash
ORGOS_LIVE_VERIFY=1 ORGOS_LIVE_VERIFY_ROUNDTRIP=1 ./scripts/wire-live-verify.sh mal live
```

roundtrip 時は子プロセスに `ORGOS_EMAIL_WIRE_REQUIRED=1` を渡す（明示上書き可）。

### email_wire を blocking ゲートにする（方針 B · opt-in）

```bash
ORGOS_EMAIL_WIRE_REQUIRED=1 ./scripts/prod-validate-wire.sh mal
ORGOS_EMAIL_WIRE_REQUIRED=1 ORGOS_LIVE_VERIFY=1 ./scripts/wire-live-verify.sh mal check
# または
ORGOS_LIVE_VERIFY=1 ORGOS_LIVE_VERIFY_STRICT_EMAIL=1 ./scripts/wire-live-verify.sh mal check
ORGOS_LIVE_VERIFY=1 npm run orgos -- wire live-verify --tenant mal --strict-email-wire
```

### Witness receipt キャッシュ補完

```bash
npm run orgos -- --tenant mal protocol witness cache-missing
```

Hub に receipt が無い場合は解決しない。registry orphan は次を dry-run:

```bash
npm run orgos -- --tenant mal protocol transaction prune-orphans
npm run orgos -- --tenant mal protocol transaction prune-orphans --apply
```

---

## 検証ステップ

| id | 内容 |
|----|------|
| `wire_health` | `PUBLIC_BASE_URL/wire/v1/health` → 200 |
| `wire_prod_gate` | `doctor --wire-prod` 相当 |
| `email_wire_readiness` | `evaluateEmailWireReadiness` |
| `witness_receipt_cache` | outbound tx 全件にローカル receipt |
| `wire_checklist` | 静的 Wire チェックリスト ≥ 80 |
| `email_wire_roundtrip` | `--roundtrip` 時のみ Phase 4 live |

証跡: `scratch/wire-live-verify-{tenant}-{timestamp}.json`

---

## Vitest との共存

| 問題 | 対策 |
|------|------|
| `mail-config.yaml` 消失 | `tests/setup-restore-protocol.ts` が mal L2 + mal-pilot example を preserve |
| フルスイートと Phase 4 同時実行 | **禁止** — `./scripts/run-full-test-isolated.sh` · Phase 4 は vitest を pkill する |
| `ORGOS_SMTP_*` 漏洩 | `resolveWireOutboundConfig` が `provider: dry_run` を尊重 |
| mal gate テスト | `mal-wire-pilot-gate.test.ts` が mail-config を backup/restore |
| orphan 復活 | HEAD の `transactions-registry.yaml` を空に commit · `protocol transaction prune-orphans --apply` |
| email_wire loopback の witness noise | validate / live-verify は hub-path（wire_v1/relay）のみ要求 |

### 隔離フルテスト

```bash
./scripts/run-full-test-isolated.sh
# log: scratch/full-test-*.log
```

### Phase 4a 安定性

```bash
./scripts/phase4-live-stability.sh mal 3
```

### Live 失敗の切り分け

| 症状 | 確認 |
|------|------|
| SMTP auth fail | L2 `smtp.env` / `.env.mail-wire` · `ai@malkk.com` のみ |
| IMAP sync 0 | mail-config `receive.sync: imap` · Vitest 停止 |
| ingest 0 | `ai+wireloop@` 配送 · base64 MIME · `wire-scan` |
| `witness-receipt-missing` | `protocol witness cache-missing` · 不可なら `prune-orphans --apply` |
| readiness deferred で誤 PASS | `--strict-email-wire` または `ORGOS_EMAIL_WIRE_REQUIRED=1` |

---

## 関連

```bash
./scripts/prod-validate-wire.sh mal
./scripts/phase4-mal-email-wire-live.sh mal check
npm run orgos -- wire-gateway score --strict
```
