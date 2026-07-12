# Gmail / email_wire 出荷ゲートチェックリスト

**Parent:** [ADR 0004](../adr/0004-gmail-deferred-opt-in-gate.md) · [community-tenant-mail.md](community-tenant-mail.md) · [deploy/mal-pilot/README.md](../../deploy/mal-pilot/README.md)

---

## 前提

| 項目 | 出荷前（現在） | 出荷後 |
|------|----------------|--------|
| `ORGOS_EMAIL_WIRE_REQUIRED` | 未設定 | `1`（mal 本番 env） |
| `tenant_mail_connect_*` | `false` | Phase 4b 完了後 `true` |
| Community `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED` | 未設定 | `1` |

---

## Phase 4a — email_wire SMTP/IMAP（Community OAuth より先行可）

### 準備

- [x] `deploy/mal-pilot/mail-config.mal-pilot.yaml.example` — tracked 正本（Zone C 消失時の再生成源）
- [x] `tenants/mal/records/executive/mail-config.mal-pilot.yaml.example` — deploy から同期（gitignore 可）
- [x] `deploy/mal-pilot/env/.env.mail-wire` — L2 SMTP/IMAP（`ai@malkk.com`）※gitignore
- [x] `tenants/mal/records/executive/mail-config.yaml` — mal-pilot テンプレから生成 ※gitignore
- [x] Wire Gateway 公開 health 200（`https://wire.oorgos.org/wire/v1/health`）
- [x] `protocol wire-hygiene` / `ensureMalMailConfigExampleFiles` — mail-config 耐久

### 検証

```bash
./scripts/phase4-mal-email-wire-live.sh mal check
./scripts/phase4-live-stability.sh mal 3
ORGOS_LIVE_VERIFY=1 ORGOS_EMAIL_WIRE_REQUIRED=1 ./scripts/wire-live-verify.sh mal check
```

- [x] `ORGOS_EMAIL_WIRE_REQUIRED=1 ./scripts/prod-validate-wire.sh mal` PASS
- [x] Phase 4a `mal check` PASS（mail-config · blocking doctor）
- [x] Phase 4a live 連続 green（stability · ingest retry）
- [x] `email_wire_roundtrip` 証跡: `scratch/wire-live-verify-mal-*.json`
- [x] 隔離フルテスト: `./scripts/run-full-test-isolated.sh`（証跡例: `scratch/full-test-wave2b-green-20260712T050952Z.log` · **325** files / **1349** tests）
- [x] mail-config 耐久: `deploy/mal-pilot/mail-config.mal-pilot.yaml.example` + `ensureMalMailConfigExampleFiles` · Phase 4 live で deploy → records 再同期
- [x] Phase 4b 自動化証跡: `scratch/phase4b-staging-automated-*.json`（ブラウザ OAuth は人手）
- [x] `scanMailReceivedForWire.ingested_event_ids` · registry sync（`wire-pilot-hygiene` 含む）

### データ衛生（Wave 0）

- [x] mal `peers.yaml` pk-DID 正本
- [x] orphan transactions prune CLI
- [x] git commit of clean `transactions-registry.yaml` + peers + codec/DID fixes

### Wave 3 で直した本番バグ

- [x] `ourOrgRef()` — `ORGOS_REQUIRE_PK_DID=1` 時に pk-DID origin
- [x] `resolveOrgRef` — OpenOrg DID を `steward://tenant/did:…` に壊さない
- [x] `findPeerByOrgRef` — `peer.did` 照合

### 本番 env 固定（CEO 承認後）

```bash
# deploy/mal-pilot/env/mal-ship-gate.env.example を参照
# または dry-run（systemd は変更しない）:
./scripts/mal-ship-gate-check.sh mal

export ORGOS_EMAIL_WIRE_REQUIRED=1
./scripts/prod-validate-wire.sh mal   # email_wire blocking で PASS 必須
```

---

## Phase 4b — Community Gmail OAuth（後追い）

- [ ] Google OAuth redirect 2 本（login + orgos-mail callback）
- [ ] Steward: `ORGOS_GMAIL_CLIENT_*` · `ORGOS_COMMUNITY_GOVERNANCE_TOKEN`
- [x] Community feature flag 既定 OFF · E2E 503（`COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED`）
- [x] ステージング自動化: `./scripts/phase4b-community-gmail-staging.sh check|e2e`
- [x] 手動 OAuth 証跡テンプレ: [phase4b-oauth-evidence.md.example](phase4b-oauth-evidence.md.example)
- [ ] ステージング UI: flag 一時 `=1` で `mail setup gmail --community-link` ブラウザ確認
- [ ] 本番 `publish/protocol/community-integration.json` → `tenant_mail_connect_*: true`（**Phase 5 のみ**）

---

## CEO 承認ゲート（Phase 5 · 統合出荷）

| # | 確認 | 主体 |
|---|------|------|
| 1 | Phase 4a live roundtrip 証跡（`scratch/wire-live-verify-*.json`） | Engineering |
| 2 | Phase 4b Community E2E（任意 · OAuth 経路） | Engineering |
| 3 | **CEO / approver 承認** — `ORGOS_CEO_SHIP_APPROVED=1` | CEO |
| 4 | `ORGOS_CEO_SHIP_APPROVED=1 ./scripts/mal-ship-gate-apply.sh apply` | Operator |
| 5 | mal systemd env に `ORGOS_EMAIL_WIRE_REQUIRED=1` 反映 | Operator |
| 6 | Community 本番 env に `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED=1` | Operator |
| 7 | Community 再デプロイ · `prod-validate-wire.sh mal`（blocking）PASS | Operator |

承認記録: `orgos approval` または社内稟議（REG-004）に従う。  
**本番フラグは承認なしでは付けない** — `mal-ship-gate-apply.sh` は `ORGOS_CEO_SHIP_APPROVED=1` 必須。

---

## ロールバック

```bash
# blocking を解除（Wire のみ pilot に戻す）
unset ORGOS_EMAIL_WIRE_REQUIRED
# Community UI を非公開
unset COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED
# integration フラグを false に戻して export
```

---

## 定期確認（出荷前 · 現行運用）

スコープ分離: [phase4a-washout-f7-f10.md](phase4a-washout-f7-f10.md)（F7 WIP · F8 maturity · F9 4b · F10 ship-gate）

```bash
# Gmail 不要 — 週次またはデプロイ前
./scripts/prod-validate-wire.sh mal
# 期待: email_wire: deferred · exit 0
```
