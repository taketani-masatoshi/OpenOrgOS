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

- [x] `tenants/mal/records/executive/mail-config.mal-pilot.yaml.example` — Xserver · `ai@` テンプレ
- [x] `deploy/mal-pilot/env/.env.mail-wire` — L2 SMTP/IMAP（`ai@malkk.com`）※gitignore
- [x] `tenants/mal/records/executive/mail-config.yaml` — mal-pilot テンプレから生成 ※gitignore
- [x] Wire Gateway 公開 health 200（`https://wire.oorgos.org/wire/v1/health`）

### 検証

```bash
./scripts/phase4-mal-email-wire-live.sh mal check
ORGOS_EMAIL_WIRE_REQUIRED=1 ./scripts/phase4-mal-email-wire-live.sh mal check
ORGOS_LIVE_VERIFY=1 ORGOS_LIVE_VERIFY_STRICT_EMAIL=1 ./scripts/wire-live-verify.sh mal check
ORGOS_LIVE_VERIFY=1 ORGOS_LIVE_VERIFY_ROUNDTRIP=1 ./scripts/wire-live-verify.sh mal live
```

- [x] `ORGOS_EMAIL_WIRE_REQUIRED=1 ./scripts/prod-validate-wire.sh mal` PASS
- [x] `ORGOS_LIVE_VERIFY=1 … STRICT_EMAIL=1 … check` PASS
- [x] base64 MIME live roundtrip PASS（`scratch/wire-live-verify-mal-*.json`）

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
export ORGOS_EMAIL_WIRE_REQUIRED=1
./scripts/prod-validate-wire.sh mal   # email_wire blocking で PASS 必須
```

---

## Phase 4b — Community Gmail OAuth（後追い）

- [ ] Google OAuth redirect 2 本（login + orgos-mail callback）
- [ ] Steward: `ORGOS_GMAIL_CLIENT_*` · `ORGOS_COMMUNITY_GOVERNANCE_TOKEN`
- [ ] Community: `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED=1`
- [ ] `orgos mail setup gmail --community-link` → token push E2E
- [ ] `publish/protocol/community-integration.json` → `tenant_mail_connect_api/ui: true`
- [ ] `orgos protocol community export`

---

## CEO 承認ゲート（Phase 5 · 統合出荷）

| # | 確認 | 主体 |
|---|------|------|
| 1 | Phase 4a live roundtrip 証跡（`scratch/wire-live-verify-*.json`） | Engineering |
| 2 | Phase 4b Community E2E（任意 · OAuth 経路） | Engineering |
| 3 | **CEO / approver 承認** — 本番 env で blocking 化 | CEO |
| 4 | mal systemd env に `ORGOS_EMAIL_WIRE_REQUIRED=1` 反映 | Operator |
| 5 | Community 本番 env に `COMMUNITY_TENANT_MAIL_CONNECT_SHIPPED=1` | Operator |
| 6 | integration フラグ `true` + Steward export + Community 再デプロイ | Operator |

承認記録: `orgos approval` または社内稟議（REG-004）に従う。

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

```bash
# Gmail 不要 — 週次またはデプロイ前
./scripts/prod-validate-wire.sh mal
# 期待: email_wire: deferred · exit 0
```
