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

---

## コマンド

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

### Witness receipt キャッシュ補完

```bash
npm run orgos -- --tenant mal protocol witness cache-missing
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
| `mail-config.yaml` 消失 | `tests/setup-restore-protocol.ts` が mal L2 を preserve |
| `ORGOS_SMTP_*` 漏洩 | `resolveWireOutboundConfig` が `provider: dry_run` を尊重 |
| mal gate テスト | `mal-wire-pilot-gate.test.ts` が mail-config を backup/restore |

---

## 関連

```bash
./scripts/prod-validate-wire.sh mal
./scripts/phase4-mal-email-wire-live.sh mal check
npm run orgos -- wire-gateway score --strict
```
